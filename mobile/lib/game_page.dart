import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

import 'app_model.dart';
import 'app_theme.dart';
import 'offline_game_server.dart';

/// Small, testable tilt filter. The first comfortable holding pose is neutral.
class TiltSteering {
  double? neutral;
  double value = 0;
  void calibrate() {
    neutral = null;
    value = 0;
  }

  double sample(double radians, double sensitivity, bool inverted) {
    if (!radians.isFinite) return value;
    neutral ??= radians;
    var delta = radians - neutral!;
    const deadzone = .035;
    delta = delta.abs() <= deadzone
        ? 0
        : delta - (delta.isNegative ? -deadzone : deadzone);
    final target = (delta / .48 * sensitivity * (inverted ? -1 : 1)).clamp(
      -1.0,
      1.0,
    );
    value += (target - value) * .28;
    if (value.abs() < .015) value = 0;
    return value;
  }
}

class GamePage extends StatefulWidget {
  const GamePage({super.key, required this.model, this.resume = false});
  final AppModel model;
  final bool resume;
  @override
  State<GamePage> createState() => _GamePageState();
}

class _GamePageState extends State<GamePage> with WidgetsBindingObserver {
  static const _tiltEvents = EventChannel('windway/tilt');
  static const _platform = MethodChannel('windway/platform');
  OfflineGameServer? _server;
  WebViewController? _controller;
  StreamSubscription<dynamic>? _tiltSubscription;
  final _tilt = TiltSteering();
  Future<void> _messageQueue = Future<void>.value();
  Timer? _watchdog;
  bool _loading = true, _leaving = false, _suspended = false, _ready = false;
  bool _steerBusy = false, _backDialog = false;
  bool _hasStarted = false;
  String? _error;
  String _status = 'loading';
  int _generation = 0;
  double _lastSteer = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(
      _platform.invokeMethod<void>('keepAwake', true).catchError((Object _) {}),
    );
    unawaited(_boot());
  }

  Future<void> _boot() async {
    final generation = ++_generation;
    _watchdog?.cancel();
    await _stopTilt();
    final oldServer = _server;
    if (mounted) {
      setState(() {
        _controller = null;
        _loading = true;
        _error = null;
        _ready = false;
        _status = 'loading';
        _steerBusy = false;
      });
    }
    await oldServer?.close();
    final server = OfflineGameServer();
    _server = server;
    try {
      final base = await server.start();
      if (!mounted || generation != _generation) {
        await server.close();
        return;
      }
      final controller = WebViewController();
      await controller.setJavaScriptMode(JavaScriptMode.unrestricted);
      await controller.setBackgroundColor(Colors.transparent);
      await controller.enableZoom(false);
      if (controller.platform is AndroidWebViewController) {
        final android = controller.platform as AndroidWebViewController;
        await AndroidWebViewController.enableDebugging(kDebugMode);
        await android.setAllowFileAccess(false);
        await android.setAllowContentAccess(false);
        await android.setGeolocationEnabled(false);
        await android.setMixedContentMode(MixedContentMode.neverAllow);
        await android.setMediaPlaybackRequiresUserGesture(false);
      }
      await controller.addJavaScriptChannel(
        'WindwayNative',
        onMessageReceived: (message) {
          if (generation != _generation) return;
          _messageQueue = _messageQueue
              .then((_) => _receive(message.message, generation))
              .catchError((Object _) {
                if (generation == _generation) {
                  _fail(
                    'The game connection was interrupted. Your last saved checkpoint is safe.',
                  );
                }
              });
        },
      );
      await controller.setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (request) {
            final uri = Uri.tryParse(request.url);
            return uri != null && server.accepts(uri, documentOnly: true)
                ? NavigationDecision.navigate
                : NavigationDecision.prevent;
          },
          onWebResourceError: (error) {
            if (generation == _generation && error.isForMainFrame != false) {
              _fail(
                'The offline game could not open. Try again, and make sure Android System WebView is up to date.',
              );
            }
          },
        ),
      );
      if (!mounted || generation != _generation) return;
      setState(() => _controller = controller);
      _watchdog = Timer(const Duration(seconds: 45), () {
        if (_loading) {
          _fail(
            'This road took too long to load. Close other apps and try again with Low graphics.',
          );
        }
      });
      await controller.loadRequest(
        base.replace(queryParameters: {'native': '1'}),
      );
    } catch (_) {
      if (generation == _generation) {
        _fail(
          'The game could not start. Your choices and last checkpoint are still saved.',
        );
      }
    }
  }

  Future<void> _receive(String raw, int generation) async {
    if (!mounted || generation != _generation || raw.length > 32768) return;
    final controller = _controller, server = _server;
    if (controller == null || server == null) return;
    final current = Uri.tryParse(await controller.currentUrl() ?? '');
    if (!mounted || generation != _generation) return;
    if (current == null || !server.accepts(current, documentOnly: true)) return;
    dynamic data;
    try {
      data = jsonDecode(raw);
    } catch (_) {
      return;
    }
    if (data is! Map<String, dynamic>) return;
    switch (data['type']) {
      case 'ready':
        if (_ready) return;
        if (data['protocol'] != 1) {
          _fail('This game package needs an app update.');
          return;
        }
        _ready = true;
        final config = jsonEncode(widget.model.gameConfig);
        final resume = jsonEncode(
          (widget.resume || _hasStarted) ? widget.model.savedRun : null,
        );
        await controller.runJavaScript(
          'window.WindwayMobile.configure($config); window.WindwayMobile.start({resume:$resume});',
        );
        if (_suspended) await _command('pause');
      case 'state':
        final status = data['status'];
        if (status is! String ||
            !const [
              'loading',
              'countdown',
              'running',
              'paused',
              'recovering',
              'finished',
              'idle',
            ].contains(status)) {
          return;
        }
        _status = status;
        if (status != 'loading') _watchdog?.cancel();
        if (mounted) setState(() => _loading = status == 'loading');
        await _reconcileTilt();
      case 'save':
        if (data['run'] is Map<String, dynamic>) {
          await widget.model.saveRun(data['run'] as Map<String, dynamic>);
          if (widget.model.savedRun != null) _hasStarted = true;
        }
      case 'finished':
        await _stopTilt();
        if (data['result'] is Map<String, dynamic>) {
          await widget.model.recordResult(
            data['result'] as Map<String, dynamic>,
          );
        }
        await widget.model.saveRun(null);
      case 'calibrate':
        _tilt.calibrate();
        await controller.runJavaScript('window.WindwayMobile?.steer(0);');
      case 'exit':
        await _exit();
      case 'error':
        _fail(
          'The graphics engine could not finish loading. Try Low graphics, or update Android System WebView.',
        );
    }
  }

  Future<void> _command(String value) async {
    if (!_ready) return;
    try {
      await _controller?.runJavaScript(
        'window.WindwayMobile?.command(${jsonEncode(value)});',
      );
    } catch (_) {}
  }

  Future<void> _reconcileTilt() async {
    if (!_suspended &&
        _status == 'running' &&
        widget.model.steeringMode == 'tilt') {
      if (_tiltSubscription != null) return;
      _tilt.calibrate();
      _tiltSubscription = _tiltEvents.receiveBroadcastStream().listen(
        (dynamic raw) {
          if (raw is! num ||
              !raw.isFinite ||
              _status != 'running' ||
              _suspended) {
            return;
          }
          final value = _tilt.sample(
            raw.toDouble(),
            widget.model.sensitivity,
            widget.model.invertTilt,
          );
          if (_steerBusy || ((value - _lastSteer).abs() < .015 && value != 0)) {
            return;
          }
          if (value == 0 && _lastSteer == 0) return;
          _lastSteer = value;
          _steerBusy = true;
          unawaited(
            _controller
                ?.runJavaScript(
                  'window.WindwayMobile?.steer(${value.toStringAsFixed(4)});',
                )
                .catchError((Object _) {})
                .whenComplete(() => _steerBusy = false),
          );
        },
        onError: (Object _) {
          unawaited(_arrowFallback());
        },
      );
    } else {
      await _stopTilt();
    }
  }

  Future<void> _arrowFallback() async {
    await _stopTilt();
    await widget.model.update(steeringMode: 'arrows');
    try {
      await _controller?.runJavaScript(
        'window.WindwayMobile?.configure({"steeringMode":"arrows"});',
      );
    } catch (_) {}
  }

  Future<void> _stopTilt() async {
    final subscription = _tiltSubscription;
    _tiltSubscription = null;
    await subscription?.cancel();
    _tilt.calibrate();
    _lastSteer = 0;
  }

  void _fail(String message) {
    if (!mounted || _leaving) return;
    _watchdog?.cancel();
    unawaited(_stopTilt());
    unawaited(_command('pause'));
    setState(() {
      _error = message;
      _loading = false;
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _suspended = false;
      // Resuming Android never presses the accelerator or resumes a paused run.
      unawaited(_reconcileTilt());
    } else {
      _suspended = true;
      unawaited(_stopTilt());
      unawaited(_command('pause'));
    }
  }

  Future<void> _back() async {
    if (_backDialog || _leaving) return;
    _backDialog = true;
    await _command('pause');
    if (!mounted) return;
    final leave = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Drive paused'),
        content: const Text(
          'Resume now, or stop and keep your last checkpoint for next time.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Resume drive'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Stop & save'),
          ),
        ],
      ),
    );
    _backDialog = false;
    if (leave == true) {
      await _command('menu');
      await _messageQueue;
      await _exit();
    } else {
      await _command('resume');
    }
  }

  Future<void> _exit() async {
    if (!mounted || _leaving) return;
    await _stopTilt();
    if (!mounted) return;
    setState(() => _leaving = true);
    await WidgetsBinding.instance.endOfFrame;
    if (mounted) Navigator.of(context).pop();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _generation++;
    _watchdog?.cancel();
    unawaited(_stopTilt());
    unawaited(_server?.close());
    unawaited(
      _platform
          .invokeMethod<void>('keepAwake', false)
          .catchError((Object _) {}),
    );
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: _leaving,
    onPopInvokedWithResult: (didPop, _) {
      if (!didPop) unawaited(_back());
    },
    child: Scaffold(
      backgroundColor: cream,
      body: Stack(
        fit: StackFit.expand,
        children: [
          if (_controller != null)
            WebViewWidget(
              key: ObjectKey(_controller),
              controller: _controller!,
            ),
          if (_loading || _error != null)
            Stack(
              fit: StackFit.expand,
              children: [
                DrivingBackdrop(road: widget.model.selectedMap),
                const ColoredBox(color: Color(0xAD0B141B)),
                SafeArea(
                  child: Center(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.all(24),
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 420),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            SvgPicture.asset(
                              'assets/art/branding/f1-loading-car.svg',
                              width: 160,
                              height: 68,
                              excludeFromSemantics: true,
                            ),
                            const SizedBox(height: 20),
                            Text(
                              _error == null
                                  ? 'Preparing your drive'
                                  : 'The road could not load',
                              textAlign: TextAlign.center,
                              style: Theme.of(context).textTheme.headlineMedium,
                            ),
                            const SizedBox(height: 12),
                            Text(
                              _error ??
                                  'Your car and the road are loading. You will be driving in a moment.',
                              textAlign: TextAlign.center,
                            ),
                            const SizedBox(height: 20),
                            if (_error == null)
                              const LinearProgressIndicator(
                                semanticsLabel: 'Preparing the offline game',
                              )
                            else
                              FilledButton(
                                onPressed: () => unawaited(_boot()),
                                child: const Text('Try again'),
                              ),
                            const SizedBox(height: 12),
                            TextButton(
                              onPressed: () => unawaited(_exit()),
                              child: const Text('Back to garage'),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
        ],
      ),
    ),
  );
}
