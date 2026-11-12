import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// The native shell's preferences. The 3D renderer never owns this state.
class AppModel extends ChangeNotifier {
  AppModel({SharedPreferencesAsync? preferences})
    : _preferences = preferences ?? SharedPreferencesAsync();

  /// No platform channels: useful for widget tests and menu previews.
  AppModel.memory() : _preferences = null;

  static const storageKey = 'windway.android.preferences.v1';
  static const mapIds = ['alpine', 'jungle', 'snow'];
  static const carIds = ['mclaren-mcl38', 'mercedes-w14'];
  static const characterIds = ['waqar', 'imran', 'tatheer', 'snowman'];
  static const paintColors = [
    '#e98254',
    '#9aba97',
    '#70b9c7',
    '#f7d674',
    '#fff7e8',
    '#334c41',
  ];

  final SharedPreferencesAsync? _preferences;
  Future<void> _writeQueue = Future<void>.value();
  bool _disposed = false;

  String selectedMap = 'alpine';
  String selectedCar = 'mclaren-mcl38';
  String selectedCharacter = 'waqar';
  String paint = '#e98254';
  String steeringMode = 'arrows';
  String cameraMode = 'chase';
  String quality = 'auto';
  bool effects = false;
  double sound = .55;
  double sensitivity = 1;
  bool invertTilt = false;
  bool reducedMotion = false;
  Map<String, dynamic>? savedRun;
  Map<String, double> bestTimes = {};
  String? storageWarning;

  bool get hasSavedRun => savedRun != null;

  static Future<AppModel> load({SharedPreferencesAsync? preferences}) async {
    final model = AppModel(preferences: preferences);
    try {
      final raw = await model._preferences!.getString(storageKey);
      if (raw != null) {
        final value = jsonDecode(raw);
        if (value is Map<String, dynamic>) model._restore(value);
      }
    } catch (_) {
      model.storageWarning =
          'Your previous settings could not be read. You can still play.';
    }
    return model;
  }

  void _restore(Map<String, dynamic> data) {
    selectedMap = _choice(data['selectedMap'], mapIds, selectedMap);
    selectedCar = _choice(data['selectedCar'], carIds, selectedCar);
    selectedCharacter = _choice(
      data['selectedCharacter'],
      characterIds,
      selectedCharacter,
    );
    paint = _choice(data['paint'], paintColors, paint);
    steeringMode = _choice(data['steeringMode'], [
      'arrows',
      'wheel',
      'tilt',
    ], steeringMode);
    cameraMode = _choice(data['cameraMode'], ['chase', 'hood'], cameraMode);
    quality = _choice(data['quality'], ['auto', 'low', 'high'], quality);
    effects = data['effects'] is bool ? data['effects'] as bool : effects;
    invertTilt = data['invertTilt'] is bool
        ? data['invertTilt'] as bool
        : invertTilt;
    reducedMotion = data['reducedMotion'] is bool
        ? data['reducedMotion'] as bool
        : reducedMotion;
    sound = _number(data['sound'], sound, 0, 1);
    sensitivity = _number(data['sensitivity'], sensitivity, .5, 1.5);
    savedRun = _validatedRun(data['savedRun']);
    bestTimes = _validatedBestTimes(data['bestTimes']);
  }

  static String _choice(dynamic value, List<String> choices, String fallback) =>
      value is String && choices.contains(value) ? value : fallback;

  static double _number(
    dynamic value,
    double fallback,
    double min,
    double max,
  ) => value is num && value.isFinite
      ? value.toDouble().clamp(min, max).toDouble()
      : fallback;

  static Map<String, dynamic>? _validatedRun(dynamic value) {
    if (value is! Map<String, dynamic> ||
        value['version'] != 1 ||
        !mapIds.contains(value['mapId'])) {
      return null;
    }
    final checkpoint = value['checkpoint'];
    final elapsed = value['elapsed'];
    if (checkpoint is! num ||
        !checkpoint.isFinite ||
        checkpoint < 0 ||
        checkpoint != checkpoint.roundToDouble() ||
        elapsed is! num ||
        !elapsed.isFinite ||
        elapsed < 0 ||
        elapsed > 604800) {
      return null;
    }
    final maxCheckpoint = value['mapId'] == 'snow' ? 15 : 7;
    if (checkpoint > maxCheckpoint) return null;
    final car = value['carId'];
    if (!carIds.contains(car)) return null;
    final lap = value['lap'];
    final resets = value['resets'];
    if (lap is! num ||
        !lap.isFinite ||
        lap != lap.roundToDouble() ||
        lap < 1 ||
        lap > (value['mapId'] == 'jungle' ? 2 : 1) ||
        resets is! num ||
        !resets.isFinite ||
        resets != resets.roundToDouble() ||
        resets < 0 ||
        resets > 1000000) {
      return null;
    }
    return {
      'version': 1,
      'mapId': value['mapId'],
      'carId': car,
      'checkpoint': checkpoint.toInt(),
      'elapsed': elapsed.toDouble(),
      'lap': lap.toInt(),
      'resets': resets.toInt(),
    };
  }

  static String _recordKey(String mapId, String carId) =>
      mapId == 'alpine' ? carId : '$mapId:$carId';

  static Map<String, double> _validatedBestTimes(dynamic data) {
    if (data is! Map) return {};
    final validKeys = {
      for (final map in mapIds)
        for (final car in carIds) _recordKey(map, car),
    };
    return {
      for (final entry in data.entries)
        if (validKeys.contains(entry.key) &&
            entry.value is num &&
            (entry.value as num).isFinite &&
            entry.value > 0 &&
            entry.value <= 604800)
          entry.key as String: (entry.value as num).toDouble(),
    };
  }

  Future<void> recordResult(Map<String, dynamic> result) {
    final map = result['mapId'];
    final car = result['carId'];
    final time = result['time'];
    if (!mapIds.contains(map) ||
        !carIds.contains(car) ||
        time is! num ||
        !time.isFinite ||
        time <= 0 ||
        time > 604800) {
      return Future<void>.value();
    }
    final key = _recordKey(map as String, car as String);
    final previous = bestTimes[key];
    if (previous != null && previous <= time) return Future<void>.value();
    bestTimes = {...bestTimes, key: time.toDouble()};
    if (!_disposed) notifyListeners();
    return _persist();
  }

  Map<String, dynamic> get gameConfig => {
    'mapId': selectedMap,
    'carId': selectedCar,
    'character': selectedCharacter,
    'paint': paint,
    'steeringMode': steeringMode,
    'cameraMode': cameraMode,
    'quality': quality,
    'effects': effects,
    'sound': sound,
    'sensitivity': sensitivity,
    'invertTilt': invertTilt,
    'reducedMotion': reducedMotion,
    'resume': savedRun == null ? null : Map<String, dynamic>.from(savedRun!),
    'bestTimes': Map<String, double>.from(bestTimes),
  };

  Future<void> update({
    String? selectedMap,
    String? selectedCar,
    String? selectedCharacter,
    String? paint,
    String? steeringMode,
    String? cameraMode,
    String? quality,
    bool? effects,
    double? sound,
    double? sensitivity,
    bool? invertTilt,
    bool? reducedMotion,
  }) {
    _restore({
      'selectedMap': selectedMap ?? this.selectedMap,
      'selectedCar': selectedCar ?? this.selectedCar,
      'selectedCharacter': selectedCharacter ?? this.selectedCharacter,
      'paint': paint ?? this.paint,
      'steeringMode': steeringMode ?? this.steeringMode,
      'cameraMode': cameraMode ?? this.cameraMode,
      'quality': quality ?? this.quality,
      'effects': effects ?? this.effects,
      'sound': sound ?? this.sound,
      'sensitivity': sensitivity ?? this.sensitivity,
      'invertTilt': invertTilt ?? this.invertTilt,
      'reducedMotion': reducedMotion ?? this.reducedMotion,
      'savedRun': savedRun,
      'bestTimes': bestTimes,
    });
    if (!_disposed) notifyListeners();
    return _persist();
  }

  Future<void> saveRun(Map<String, dynamic>? run) {
    savedRun = _validatedRun(run);
    if (!_disposed) notifyListeners();
    return _persist();
  }

  Future<void> _persist() {
    if (_preferences == null) return Future<void>.value();
    // Capture each update, then write in order. A slow earlier write can never
    // overwrite a newer preference or checkpoint snapshot.
    final snapshot = jsonEncode({
      'selectedMap': selectedMap,
      'selectedCar': selectedCar,
      'selectedCharacter': selectedCharacter,
      'paint': paint,
      'steeringMode': steeringMode,
      'cameraMode': cameraMode,
      'quality': quality,
      'effects': effects,
      'sound': sound,
      'sensitivity': sensitivity,
      'invertTilt': invertTilt,
      'reducedMotion': reducedMotion,
      'savedRun': savedRun,
      'bestTimes': bestTimes,
    });
    _writeQueue = _writeQueue.then((_) async {
      try {
        await _preferences.setString(storageKey, snapshot);
        if (storageWarning != null) {
          storageWarning = null;
          if (!_disposed) notifyListeners();
        }
      } catch (_) {
        storageWarning =
            'Settings could not be saved on this device. Play is still available.';
        if (!_disposed) notifyListeners();
      }
    });
    return _writeQueue;
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
