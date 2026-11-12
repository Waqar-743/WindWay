import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:windway/game_page.dart';
import 'package:windway/offline_game_server.dart';

class MemoryBundle extends CachingAssetBundle {
  MemoryBundle(this.files, {this.gate});
  final Map<String, List<int>> files;
  final Future<void>? gate;
  final List<String> requested = [];
  int active = 0;
  int peak = 0;

  @override
  Future<ByteData> load(String key) async {
    requested.add(key);
    active++;
    if (active > peak) peak = active;
    try {
      if (gate != null) await gate;
      final bytes = files[key];
      if (bytes == null) throw FlutterError('Missing test asset');
      // Exercise ByteData with a non-zero buffer offset too.
      final backing = Uint8List(bytes.length + 8)
        ..setRange(4, bytes.length + 4, bytes);
      return ByteData.sublistView(backing, 4, bytes.length + 4);
    } finally {
      active--;
    }
  }
}

class Reply {
  Reply(this.status, this.bytes, this.headers);
  final int status;
  final List<int> bytes;
  final HttpHeaders headers;
  String get text => utf8.decode(bytes);
}

Future<Reply> fetch(
  Uri uri, {
  String method = 'GET',
  Map<String, String> headers = const {},
}) async {
  final client = HttpClient()..connectionTimeout = const Duration(seconds: 3);
  try {
    final request = await client.openUrl(method, uri);
    headers.forEach(request.headers.set);
    final response = await request.close();
    final body = await response.fold<List<int>>(
      [],
      (all, chunk) => all..addAll(chunk),
    );
    return Reply(response.statusCode, body, response.headers);
  } finally {
    client.close(force: true);
  }
}

Future<void> until(bool Function() predicate) async {
  final deadline = DateTime.now().add(const Duration(seconds: 4));
  while (!predicate()) {
    if (DateTime.now().isAfter(deadline)) {
      throw TimeoutException('Condition was not reached');
    }
    await Future<void>.delayed(const Duration(milliseconds: 5));
  }
}

Map<String, List<int>> files() => {
  'assets/game/index.html': utf8.encode(
    '<!doctype html><title>Windway</title>',
  ),
  'assets/game/assets/game.js': utf8.encode('window.game=true;'),
  'assets/game/assets/style.css': utf8.encode('body{color:green}'),
  'assets/game/assets/physics.wasm': [0, 97, 115, 109, 1, 0, 0, 0],
  'assets/game/models/car.glb': List.generate(32, (i) => i),
  'assets/game/art/road.svg': utf8.encode(
    '<svg xmlns="http://www.w3.org/2000/svg"/>',
  ),
  'assets/game/empty.bin': [],
};

void main() {
  group('private offline game origin', () {
    late OfflineGameServer server;
    late MemoryBundle bundle;
    late Uri base;

    setUp(() async {
      bundle = MemoryBundle(files());
      server = OfflineGameServer(bundle: bundle);
      base = await server.start();
    });
    tearDown(() => server.close());

    test('start is idempotent and binds only IPv4 loopback', () async {
      final again = await Future.wait([server.start(), server.start()]);
      expect(again, [base, base]);
      expect(base.host, '127.0.0.1');
      expect(base.scheme, 'http');
      expect(base.port, greaterThan(0));
      expect(base.path, matches(RegExp(r'^/[A-Za-z0-9_-]{32}/$')));
    });

    test('each server gets a fresh unpredictable document prefix', () async {
      final other = OfflineGameServer(bundle: bundle);
      try {
        final uri = await other.start();
        expect(uri.path, isNot(base.path));
      } finally {
        await other.close();
      }
    });

    test('accepts only its exact origin and token prefix', () {
      expect(server.accepts(base), isTrue);
      expect(server.accepts(base.resolve('assets/game.js')), isTrue);
      for (final wrong in [
        base.replace(host: 'localhost'),
        base.replace(host: '127.0.0.2'),
        base.replace(scheme: 'https'),
        base.replace(port: base.port + 1),
        base.replace(userInfo: 'user:password'),
        base.replace(path: '/'),
        base.replace(
          path:
              '${base.path.substring(0, base.path.length - 1)}extra/index.html',
        ),
      ]) {
        expect(server.accepts(wrong), isFalse, reason: wrong.toString());
      }
    });

    test('document-only navigation rejects assets and subdirectories', () {
      expect(server.accepts(base, documentOnly: true), isTrue);
      expect(
        server.accepts(
          base.resolve('index.html?native=1#race'),
          documentOnly: true,
        ),
        isTrue,
      );
      expect(
        server.accepts(base.resolve('assets/game.js'), documentOnly: true),
        isFalse,
      );
      expect(
        server.accepts(base.resolve('nested/index.html'), documentOnly: true),
        isFalse,
      );
    });

    test(
      'escaping traversal, encoded separators, double encoding and nulls are rejected',
      () {
        for (final suffix in [
          '../secret',
          '%2e%2e/secret',
          '%252e%252e/secret',
          'x%2fy',
          'x%2Fy',
          'x%5cy',
          'x%00y',
          '%255c',
        ]) {
          expect(
            server.accepts(Uri.parse('$base$suffix')),
            isFalse,
            reason: suffix,
          );
        }
      },
    );

    test(
      'URI normalization cannot expose files outside the bundled game',
      () async {
        // Dart normalizes these before accepts() sees them. They are identical
        // to benign in-prefix URLs, but can only read assets/game, never disk.
        for (final suffix in ['x/%2e%2e/secret', 'x\\y']) {
          final uri = Uri.parse('$base$suffix');
          expect(server.accepts(uri), isTrue);
          expect((await fetch(uri)).status, 404);
          expect(bundle.requested.last, startsWith('assets/game/'));
        }
        expect(server.accepts(Uri.parse('$base%2e%2e/secret')), isFalse);
      },
    );

    test('GET serves root HTML with no-store and security headers', () async {
      final reply = await fetch(base);
      expect(reply.status, 200);
      expect(reply.text, contains('<title>Windway</title>'));
      expect(reply.headers.contentType!.mimeType, 'text/html');
      expect(reply.headers.value('cache-control'), 'no-store');
      expect(reply.headers.value('x-content-type-options'), 'nosniff');
      expect(reply.headers.value('x-frame-options'), 'DENY');
      expect(
        reply.headers.value('cross-origin-resource-policy'),
        'same-origin',
      );
      expect(
        reply.headers.value('content-security-policy'),
        contains("connect-src 'self'"),
      );
      expect(bundle.requested, ['assets/game/index.html']);
    });

    test('HEAD returns metadata but no response body', () async {
      final reply = await fetch(base.resolve('models/car.glb'), method: 'HEAD');
      expect(reply.status, 200);
      expect(reply.bytes, isEmpty);
      expect(reply.headers.contentLength, 32);
      expect(reply.headers.contentType!.mimeType, 'model/gltf-binary');
    });

    for (final entry in const {
      'assets/game.js': 'text/javascript',
      'assets/style.css': 'text/css',
      'assets/physics.wasm': 'application/wasm',
      'models/car.glb': 'model/gltf-binary',
      'art/road.svg': 'image/svg+xml',
    }.entries) {
      test('serves ${entry.key} using the correct MIME type', () async {
        final reply = await fetch(base.resolve(entry.key));
        expect(reply.status, 200);
        expect(reply.headers.contentType!.mimeType, entry.value);
        expect(reply.headers.value('cache-control'), 'private, max-age=3600');
      });
    }

    test('missing assets and routes are 404, not an HTML fallback', () async {
      for (final path in [
        'missing.js',
        'new-route',
        'assets/',
        'no/index.html',
      ]) {
        final reply = await fetch(base.resolve(path));
        expect(reply.status, 404, reason: path);
        expect(reply.text, isNot(contains('<!doctype')));
      }
    });

    test('a wrong Host header is blocked before loading assets', () async {
      final reply = await fetch(
        base,
        headers: {'Host': 'localhost:${base.port}'},
      );
      expect(reply.status, 404);
      expect(bundle.requested, isEmpty);
    });

    test(
      'a foreign Origin is blocked and the exact origin is allowed',
      () async {
        expect(
          (await fetch(
            base,
            headers: {'Origin': 'https://example.com'},
          )).status,
          404,
        );
        expect(bundle.requested, isEmpty);
        expect(
          (await fetch(base, headers: {'Origin': base.origin})).status,
          200,
        );
      },
    );

    test('POST returns 405 and advertises GET and HEAD only', () async {
      final reply = await fetch(base, method: 'POST');
      expect(reply.status, 405);
      expect(reply.headers.value('allow'), 'GET, HEAD');
      expect(bundle.requested, isEmpty);
    });

    test('byte ranges return exact partial model bytes', () async {
      final reply = await fetch(
        base.resolve('models/car.glb'),
        headers: {'Range': 'bytes=4-9'},
      );
      expect(reply.status, 206);
      expect(reply.bytes, [4, 5, 6, 7, 8, 9]);
      expect(reply.headers.contentLength, 6);
      expect(reply.headers.value('content-range'), 'bytes 4-9/32');
      expect(reply.headers.value('accept-ranges'), 'bytes');
    });

    test(
      'suffix, open-ended and oversized-end ranges are clamped correctly',
      () async {
        final uri = base.resolve('models/car.glb');
        expect((await fetch(uri, headers: {'Range': 'bytes=-3'})).bytes, [
          29,
          30,
          31,
        ]);
        expect((await fetch(uri, headers: {'Range': 'bytes=30-'})).bytes, [
          30,
          31,
        ]);
        expect((await fetch(uri, headers: {'Range': 'bytes=30-900'})).bytes, [
          30,
          31,
        ]);
      },
    );

    test(
      'invalid and unsatisfiable ranges return 416 with full length',
      () async {
        for (final range in [
          'bytes=32-',
          'bytes=10-2',
          'bytes=-0',
          'bytes=-',
          'bytes=0-1,3-4',
          'items=0-2',
          'bytes=999999999999999999999999999999999-',
        ]) {
          final reply = await fetch(
            base.resolve('models/car.glb'),
            headers: {'Range': range},
          );
          expect(reply.status, 416, reason: range);
          expect(reply.headers.value('content-range'), 'bytes */32');
          expect(reply.bytes, isEmpty);
        }
      },
    );

    test(
      'empty assets work, but an empty-asset range is unsatisfiable',
      () async {
        final uri = base.resolve('empty.bin');
        expect((await fetch(uri)).status, 200);
        expect((await fetch(uri)).bytes, isEmpty);
        expect((await fetch(uri, headers: {'Range': 'bytes=0-'})).status, 416);
      },
    );

    test(
      'close is idempotent and invalidates document authentication',
      () async {
        await Future.wait([server.close(), server.close()]);
        expect(server.baseUri, isNull);
        expect(server.accepts(base), isFalse);
        await expectLater(server.start(), throwsStateError);
      },
    );
  });

  test(
    'asset load concurrency is bounded even with many simultaneous requests',
    () async {
      final gate = Completer<void>();
      final bundle = MemoryBundle(files(), gate: gate.future);
      final server = OfflineGameServer(bundle: bundle, maxConcurrentLoads: 2);
      final base = await server.start();
      try {
        final pending = List.generate(
          9,
          (_) => fetch(base.resolve('models/car.glb')),
        );
        await until(() => bundle.active == 2);
        expect(bundle.peak, 2);
        expect(bundle.requested.length, 2);
        gate.complete();
        final replies = await Future.wait(pending);
        expect(replies.every((r) => r.status == 200), isTrue);
        expect(bundle.peak, lessThanOrEqualTo(2));
        expect(bundle.requested.length, 9);
      } finally {
        if (!gate.isCompleted) gate.complete();
        await server.close();
      }
    },
  );

  test(
    'closing while asset requests are queued completes without dangling clients',
    () async {
      final gate = Completer<void>();
      final bundle = MemoryBundle(files(), gate: gate.future);
      final server = OfflineGameServer(bundle: bundle, maxConcurrentLoads: 1);
      final base = await server.start();
      final pending = List.generate(5, (_) async {
        try {
          await fetch(base.resolve('models/car.glb'));
        } on IOException {
          /* Expected socket cancellation on shutdown. */
        }
      });
      await until(() => bundle.active == 1);
      await Future.wait([server.close(), server.close()]);
      gate.complete();
      await Future.wait(pending).timeout(const Duration(seconds: 4));
      expect(server.accepts(base), isFalse);
      expect(bundle.peak, 1);
    },
  );

  test(
    'a server closed during startup never exposes a usable origin',
    () async {
      final server = OfflineGameServer(bundle: MemoryBundle(files()));
      final started = server.start();
      final result = expectLater(started, throwsStateError);
      await server.close();
      await result;
      expect(server.baseUri, isNull);
    },
  );

  test('invalid concurrency limits are rejected', () {
    expect(() => OfflineGameServer(maxConcurrentLoads: 0), throwsArgumentError);
    expect(() => OfflineGameServer(maxConcurrentLoads: 9), throwsArgumentError);
  });

  group('tilt steering filter', () {
    test('first sample sets a comfortable neutral pose', () {
      final tilt = TiltSteering();
      expect(tilt.sample(.7, 1, false), 0);
      expect(tilt.neutral, .7);
    });

    test('dead zone removes small accidental movements', () {
      final tilt = TiltSteering()..sample(0, 1, false);
      expect(tilt.sample(.03, 1, false), 0);
      expect(tilt.sample(-.03, 1, false), 0);
    });

    test('steering is smoothed rather than snapping to full lock', () {
      final tilt = TiltSteering()..sample(0, 1, false);
      final first = tilt.sample(.6, 1, false);
      final second = tilt.sample(.6, 1, false);
      expect(first, closeTo(.28, .00001));
      expect(second, greaterThan(first));
      expect(second, lessThan(1));
    });

    test('inversion swaps direction and sensitivity scales response', () {
      final normal = TiltSteering()..sample(0, 1, false);
      final inverted = TiltSteering()..sample(0, 1, true);
      final calm = TiltSteering()..sample(0, .5, false);
      final a = normal.sample(.2, 1, false);
      expect(inverted.sample(.2, 1, true), closeTo(-a, .00001));
      expect(calm.sample(.2, .5, false), closeTo(a / 2, .00001));
    });

    test(
      'extreme angles stay bounded and invalid samples do not poison state',
      () {
        final tilt = TiltSteering()..sample(0, 1, false);
        for (var i = 0; i < 100; i++) {
          expect(tilt.sample(80, 1.5, false), inInclusiveRange(-1, 1));
        }
        final previous = tilt.value;
        expect(tilt.sample(double.nan, 1, false), previous);
        expect(tilt.sample(double.infinity, 1, false), previous);
      },
    );

    test('recalibration clears old input and captures a new neutral', () {
      final tilt = TiltSteering()
        ..sample(0, 1, false)
        ..sample(.4, 1, false);
      expect(tilt.value, greaterThan(0));
      tilt.calibrate();
      expect(tilt.value, 0);
      expect(tilt.neutral, isNull);
      expect(tilt.sample(-.8, 1, false), 0);
      expect(tilt.neutral, -.8);
    });
  });
}
