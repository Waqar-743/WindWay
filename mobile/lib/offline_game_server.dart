import 'dart:async';
import 'dart:collection';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/services.dart';

/// A private, short-lived origin for the bundled game, never a public web server.
///
/// Assets are read on demand with bounded concurrency and are not retained in a
/// second Dart-side cache. The unpredictable path also keeps other local pages
/// from discovering the privileged JavaScript bridge's origin and document.
class OfflineGameServer {
  OfflineGameServer({AssetBundle? bundle, int maxConcurrentLoads = 3})
    : _bundle = bundle ?? rootBundle,
      _maxConcurrentLoads = maxConcurrentLoads {
    if (maxConcurrentLoads < 1 || maxConcurrentLoads > 8) {
      throw ArgumentError.value(maxConcurrentLoads, 'maxConcurrentLoads');
    }
  }

  final AssetBundle _bundle;
  final int _maxConcurrentLoads;
  final Queue<Completer<void>> _waiting = Queue<Completer<void>>();
  HttpServer? _server;
  Uri? _baseUri;
  Future<Uri>? _starting;
  int _activeLoads = 0;
  bool _closed = false;

  Uri? get baseUri => _baseUri;

  Future<Uri> start() {
    if (_closed) return Future.error(StateError('The game server is closed.'));
    if (_baseUri case final uri?) return Future.value(uri);
    return _starting ??= _start();
  }

  Future<Uri> _start() async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    if (_closed) {
      await server.close(force: true);
      throw StateError('The game server was closed during startup.');
    }
    final random = Random.secure();
    final token = base64Url
        .encode(List<int>.generate(24, (_) => random.nextInt(256)))
        .replaceAll('=', '');
    _server = server;
    _baseUri = Uri(
      scheme: 'http',
      host: '127.0.0.1',
      port: server.port,
      path: '/$token/',
    );
    server.listen(
      (request) {
        unawaited(_handle(request));
      },
      onError: (Object _) {
        // Socket errors are handled by the WebView's recoverable loading screen.
      },
    );
    return _baseUri!;
  }

  /// Use the same policy for navigation and bridge-message authentication.
  bool accepts(Uri uri, {bool documentOnly = false}) {
    final base = _baseUri;
    if (base == null ||
        _closed ||
        uri.scheme != base.scheme ||
        uri.host != base.host ||
        uri.port != base.port ||
        uri.userInfo.isNotEmpty ||
        !uri.path.startsWith(base.path)) {
      return false;
    }
    // Uri has already normalized dot segments. Containment is checked against
    // the resulting exact token prefix, and asset reads are bundle-only.
    final relative = uri.path.substring(base.path.length);
    if (!_safeRelativePath(relative)) return false;
    return !documentOnly || relative.isEmpty || relative == 'index.html';
  }

  bool _safeRelativePath(String path) {
    if (path.contains('\\') ||
        path.contains('\u0000') ||
        RegExp(r'%2f|%5c|%00', caseSensitive: false).hasMatch(path)) {
      return false;
    }
    try {
      final segments = path.split('/').map(Uri.decodeComponent);
      return segments.every(
        (segment) =>
            segment != '.' &&
            segment != '..' &&
            !segment.contains('/') &&
            !segment.contains('\\') &&
            !segment.contains('\u0000') &&
            !segment.contains('%'),
      );
    } on FormatException {
      return false;
    }
  }

  Future<void> _handle(HttpRequest request) async {
    final response = request.response;
    _securityHeaders(response);
    try {
      if (request.method != 'GET' && request.method != 'HEAD') {
        response.headers.set(HttpHeaders.allowHeader, 'GET, HEAD');
        response.statusCode = HttpStatus.methodNotAllowed;
        return;
      }
      final base = _baseUri;
      final host = request.headers.value(HttpHeaders.hostHeader);
      final origin = request.headers.value('origin');
      if (base == null ||
          host != '${base.host}:${base.port}' ||
          (origin != null && origin != base.origin) ||
          !accepts(base.resolveUri(request.uri))) {
        response.statusCode = HttpStatus.notFound;
        return;
      }
      var relative = request.uri.path.substring(base.path.length);
      if (relative.isEmpty) relative = 'index.html';
      if (relative.endsWith('/')) {
        response.statusCode = HttpStatus.notFound;
        return;
      }
      relative = Uri.decodeComponent(relative);
      await _acquire();
      try {
        if (_closed) return;
        ByteData data;
        try {
          data = await _bundle.load('assets/game/$relative');
        } catch (_) {
          response.statusCode = HttpStatus.notFound;
          return;
        }
        // Protect small devices if an accidental oversized asset is bundled.
        if (data.lengthInBytes > 24 * 1024 * 1024) {
          response.statusCode = HttpStatus.requestEntityTooLarge;
          return;
        }
        final bytes = data.buffer.asUint8List(
          data.offsetInBytes,
          data.lengthInBytes,
        );
        response.headers.set(HttpHeaders.contentTypeHeader, _mime(relative));
        response.headers.set(HttpHeaders.acceptRangesHeader, 'bytes');
        response.headers.set(
          HttpHeaders.cacheControlHeader,
          relative == 'index.html' ? 'no-store' : 'private, max-age=3600',
        );
        var start = 0;
        var end = bytes.length - 1;
        final range = request.headers.value(HttpHeaders.rangeHeader);
        if (range != null) {
          final parsed = _byteRange(range, bytes.length);
          if (parsed == null) {
            response.statusCode = HttpStatus.requestedRangeNotSatisfiable;
            response.headers.set(
              HttpHeaders.contentRangeHeader,
              'bytes */${bytes.length}',
            );
            return;
          }
          start = parsed.$1;
          end = parsed.$2;
          response.statusCode = HttpStatus.partialContent;
          response.headers.set(
            HttpHeaders.contentRangeHeader,
            'bytes $start-$end/${bytes.length}',
          );
        }
        response.contentLength = end - start + 1;
        if (request.method == 'GET' && bytes.isNotEmpty) {
          response.add(Uint8List.sublistView(bytes, start, end + 1));
          await response.flush();
        }
      } finally {
        _release();
      }
    } catch (_) {
      // Closing or navigating away can cancel in-flight local asset requests.
      // Do not leak file names, tokens, or native exception details to HTML.
      try {
        response.statusCode = HttpStatus.internalServerError;
      } catch (_) {}
    } finally {
      try {
        await response.close();
      } catch (_) {}
    }
  }

  Future<void> _acquire() async {
    if (_activeLoads < _maxConcurrentLoads) {
      _activeLoads++;
      return;
    }
    final waiter = Completer<void>();
    _waiting.add(waiter);
    await waiter.future;
  }

  void _release() {
    if (_waiting.isNotEmpty) {
      _waiting.removeFirst().complete();
    } else {
      _activeLoads--;
    }
  }

  (int, int)? _byteRange(String value, int length) {
    final match = RegExp(r'^bytes=(\d*)-(\d*)$').firstMatch(value);
    if (match == null || length == 0) return null;
    final first = match.group(1)!;
    final last = match.group(2)!;
    if (first.isEmpty && last.isEmpty) return null;
    if (first.isEmpty) {
      final suffix = int.tryParse(last);
      if (suffix == null || suffix <= 0) return null;
      return (max(0, length - suffix), length - 1);
    }
    final start = int.tryParse(first);
    final end = last.isEmpty ? length - 1 : int.tryParse(last);
    if (start == null || end == null || start >= length || end < start) {
      return null;
    }
    return (start, min(end, length - 1));
  }

  void _securityHeaders(HttpResponse response) {
    response.headers
      ..set('X-Content-Type-Options', 'nosniff')
      ..set('Referrer-Policy', 'no-referrer')
      ..set('Cross-Origin-Resource-Policy', 'same-origin')
      ..set('X-Frame-Options', 'DENY')
      ..set(
        'Content-Security-Policy',
        "default-src 'self'; "
            "script-src 'self' 'wasm-unsafe-eval'; "
            "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
            "font-src 'self' data:; connect-src 'self'; "
            "media-src 'self' blob:; worker-src 'self' blob:; "
            "object-src 'none'; frame-src 'none'; frame-ancestors 'none'; "
            "base-uri 'self'; form-action 'none'",
      );
  }

  String _mime(String path) {
    final extension = path.split('.').last.toLowerCase();
    return switch (extension) {
      'html' => 'text/html; charset=utf-8',
      'js' || 'mjs' => 'text/javascript; charset=utf-8',
      'css' => 'text/css; charset=utf-8',
      'json' || 'gltf' || 'map' => 'application/json; charset=utf-8',
      'wasm' => 'application/wasm',
      'glb' => 'model/gltf-binary',
      'svg' => 'image/svg+xml',
      'png' => 'image/png',
      'jpg' || 'jpeg' => 'image/jpeg',
      'webp' => 'image/webp',
      'avif' => 'image/avif',
      'ico' => 'image/x-icon',
      'woff2' => 'font/woff2',
      'woff' => 'font/woff',
      'ttf' => 'font/ttf',
      'ogg' => 'audio/ogg',
      'mp3' => 'audio/mpeg',
      'wav' => 'audio/wav',
      _ => 'application/octet-stream',
    };
  }

  Future<void> close() async {
    if (_closed) return;
    _closed = true;
    _baseUri = null;
    await _server?.close(force: true);
    _server = null;
    while (_waiting.isNotEmpty) {
      _waiting.removeFirst().complete();
    }
  }
}
