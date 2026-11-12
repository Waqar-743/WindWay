import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:windway/app_model.dart';
import 'package:windway/app_theme.dart';
import 'package:windway/game_page.dart';
import 'package:windway/menu_screens.dart';

Map<String, dynamic> checkpoint({
  String map = 'alpine',
  int gate = 2,
  int lap = 1,
}) => {
  'version': 1,
  'mapId': map,
  'carId': 'mclaren-mcl38',
  'checkpoint': gate,
  'elapsed': 42.5,
  'lap': lap,
  'resets': 0,
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('model validates settings and uses mobile-friendly defaults', () async {
    final model = AppModel.memory();
    expect(model.effects, isFalse);
    expect(model.hasSavedRun, isFalse);
    await model.update(
      selectedMap: 'missing',
      selectedCar: 'wrong',
      steeringMode: 'tilt',
      sensitivity: 7,
      sound: -2,
      cameraMode: 'hood',
      quality: 'low',
    );
    expect(model.selectedMap, 'alpine');
    expect(model.selectedCar, 'mclaren-mcl38');
    expect(model.sensitivity, 1.5);
    expect(model.sound, 0);
    expect(model.gameConfig['steeringMode'], 'tilt');
    expect(model.gameConfig['cameraMode'], 'hood');
    expect(model.gameConfig['quality'], 'low');
    model.dispose();
  });

  test('only valid unfinished checkpoints enable Continue', () async {
    final model = AppModel.memory();
    await model.saveRun(checkpoint());
    expect(model.hasSavedRun, isTrue);
    expect(model.gameConfig['resume']['checkpoint'], 2);
    for (final invalid in [
      {...checkpoint(), 'version': 2},
      {...checkpoint(), 'carId': 'unknown'},
      {...checkpoint(), 'elapsed': double.infinity},
      {...checkpoint(), 'elapsed': 604801},
      checkpoint(gate: 8),
      checkpoint(map: 'snow', gate: 16),
      checkpoint(lap: 2),
      {...checkpoint(), 'resets': -1},
      {...checkpoint(), 'checkpoint': 1.5},
      {'mapId': 'alpine'},
    ]) {
      await model.saveRun(invalid);
      expect(model.hasSavedRun, isFalse, reason: invalid.toString());
    }
    await model.saveRun(checkpoint(map: 'jungle', lap: 2));
    expect(model.hasSavedRun, isTrue);
    await model.saveRun(null);
    expect(model.hasSavedRun, isFalse);
    model.dispose();
  });

  test('best times keep the fastest valid result per road and car', () async {
    final model = AppModel.memory();
    await model.recordResult({
      'mapId': 'alpine',
      'carId': 'mclaren-mcl38',
      'time': 91.4,
    });
    await model.recordResult({
      'mapId': 'alpine',
      'carId': 'mclaren-mcl38',
      'time': 95.2,
    });
    await model.recordResult({
      'mapId': 'jungle',
      'carId': 'mercedes-w14',
      'time': 182.3,
    });
    await model.recordResult({
      'mapId': 'alpine',
      'carId': 'mclaren-mcl38',
      'time': 88.7,
    });
    await model.recordResult({
      'mapId': 'snow',
      'carId': 'mercedes-w14',
      'time': -1,
    });
    expect(model.bestTimes, {
      'mclaren-mcl38': 88.7,
      'jungle:mercedes-w14': 182.3,
    });
    await model.update(sound: .2);
    expect(model.gameConfig['bestTimes'], model.bestTimes);
    final exported = model.gameConfig['bestTimes'] as Map<String, double>;
    exported.clear();
    expect(model.bestTimes.length, 2);
    model.dispose();
  });

  testWidgets(
    'Start enters gameplay immediately and Continue is disabled without progress',
    (tester) async {
      final model = AppModel.memory();
      await model.update(reducedMotion: true);
      tester.view.physicalSize = const Size(844, 390);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        MaterialApp(
          theme: windwayTheme(),
          home: StarterScreen(model: model),
        ),
      );
      await tester.pumpAndSettle();
      final continueButton = tester.widget<OutlinedButton>(
        find.byKey(const ValueKey('continue-button')),
      );
      expect(continueButton.onPressed, isNull);
      await tester.tap(find.byKey(const ValueKey('start-button')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 350));
      expect(find.byType(GamePage), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
      model.dispose();
    },
  );

  testWidgets('Roads remains available without blocking immediate play', (
    tester,
  ) async {
    final model = AppModel.memory();
    await model.update(reducedMotion: true);
    tester.view.physicalSize = const Size(844, 390);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        theme: windwayTheme(),
        home: StarterScreen(model: model),
      ),
    );
    await tester.pumpAndSettle();
    expect(
      Theme.of(tester.element(find.byType(StarterScreen))).brightness,
      Brightness.dark,
    );
    await tester.tap(find.byKey(const ValueKey('roads-button')));
    await tester.pumpAndSettle();
    expect(find.text('Choose your road'), findsOneWidget);
    expect(find.text('Alpine Valley'), findsOneWidget);
    expect(find.text('Canopy Run'), findsOneWidget);
    expect(find.text('Frostbite Ascent'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    model.dispose();
  });

  for (final size in [
    const Size(844, 390),
    const Size(390, 844),
    const Size(640, 360),
  ]) {
    testWidgets(
      'menus avoid layout overflow at ${size.width} by ${size.height}',
      (tester) async {
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final model = AppModel.memory();
        await model.update(reducedMotion: true, steeringMode: 'tilt');
        final pages = <Widget>[
          StarterScreen(model: model),
          RoadsScreen(model: model),
          GarageScreen(model: model),
          CharactersScreen(model: model),
          OptionsScreen(model: model),
          HowToPlayScreen(model: model),
        ];
        for (final page in pages) {
          await tester.pumpWidget(
            MaterialApp(theme: windwayTheme(), home: page),
          );
          await tester.pumpAndSettle();
          expect(
            tester.takeException(),
            isNull,
            reason: page.runtimeType.toString(),
          );
          final scroll = find.byType(SingleChildScrollView).first;
          await tester.drag(scroll, const Offset(0, -1200));
          await tester.pumpAndSettle();
          expect(
            tester.takeException(),
            isNull,
            reason: '${page.runtimeType} scrolled',
          );
        }
        await tester.pumpWidget(const SizedBox.shrink());
        model.dispose();
      },
    );
  }

  testWidgets('character and steering selections update the actual model', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(844, 390);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final model = AppModel.memory();
    await model.update(reducedMotion: true);
    await tester.pumpWidget(
      MaterialApp(
        theme: windwayTheme(),
        home: CharactersScreen(model: model),
      ),
    );
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('IMRAN'));
    await tester.tap(find.text('IMRAN'));
    await tester.pumpAndSettle();
    expect(model.selectedCharacter, 'imran');
    await tester.pumpWidget(
      MaterialApp(
        theme: windwayTheme(),
        home: OptionsScreen(model: model),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Phone tilt'));
    await tester.pumpAndSettle();
    expect(model.steeringMode, 'tilt');
    expect(find.text('Calibrate before you move'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
    model.dispose();
  });

  if (const bool.fromEnvironment('WINDWAY_PREVIEWS')) {
    testWidgets('export real Flutter menu previews', (tester) async {
      await tester.runAsync(() async {
        final font = File(
          '../.tooling/flutter/bin/cache/artifacts/material_fonts/roboto-regular.ttf',
        );
        if (await font.exists()) {
          for (final family in ['Roboto', 'Ahem']) {
            final loader = FontLoader(family)
              ..addFont(font.readAsBytes().then(ByteData.sublistView));
            await loader.load();
          }
          final iconFont = File(
            '../.tooling/flutter/bin/cache/artifacts/material_fonts/materialicons-regular.otf',
          );
          if (await iconFont.exists()) {
            await (FontLoader('MaterialIcons')
                  ..addFont(iconFont.readAsBytes().then(ByteData.sublistView)))
                .load();
          }
        }
      });
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final output = Directory('build/menu-previews');
      await tester.runAsync(() => output.create(recursive: true));
      final model = AppModel.memory();
      await model.update(reducedMotion: true, steeringMode: 'tilt');
      for (final size in [const Size(844, 390), const Size(390, 844)]) {
        tester.view.physicalSize = size;
        final pages = <String, Widget>{
          'starter': StarterScreen(model: model),
          'roads': RoadsScreen(model: model),
          'characters': CharactersScreen(model: model),
          'options': OptionsScreen(model: model),
        };
        for (final entry in pages.entries) {
          final boundaryKey = GlobalKey();
          await tester.pumpWidget(
            RepaintBoundary(
              key: boundaryKey,
              child: MaterialApp(
                debugShowCheckedModeBanner: false,
                theme: windwayTheme(),
                home: entry.value,
              ),
            ),
          );
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          final boundary =
              boundaryKey.currentContext!.findRenderObject()!
                  as RenderRepaintBoundary;
          await tester.runAsync(() async {
            final image = await boundary.toImage(pixelRatio: 1.5);
            final bytes = await image.toByteData(
              format: ui.ImageByteFormat.png,
            );
            await File(
              '${output.path}/${entry.key}-${size.width.toInt()}x${size.height.toInt()}.png',
            ).writeAsBytes(bytes!.buffer.asUint8List());
            image.dispose();
          });
        }
      }
      await tester.pumpWidget(const SizedBox.shrink());
      model.dispose();
    });
  }
}
