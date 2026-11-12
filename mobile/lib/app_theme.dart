import 'package:flutter/material.dart';

// Shared by the native lobby, loading screen and in-game WebView. These aliases
// keep the existing selection screens consistent while removing light surfaces.
const cream = Color(0xFF0B141B);
const paper = Color(0xC91B2A33);
const pine = Color(0xFFF0F4F5);
const muted = Color(0xFFA9BBC5);
const orange = Color(0xFFEBA76B);
const rule = Color(0xFF344550);
const selectedSurface = Color(0xCF32413F);

ThemeData windwayTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: orange,
    brightness: Brightness.dark,
    surface: cream,
    primary: orange,
    secondary: orange,
    onSurface: pine,
    onPrimary: cream,
    outline: rule,
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: cream,
    canvasColor: cream,
    fontFamily: 'Roboto',
    textTheme: const TextTheme(
      displaySmall: TextStyle(
        fontSize: 44,
        height: 1,
        fontWeight: FontWeight.w900,
        letterSpacing: -1.7,
        color: pine,
      ),
      headlineMedium: TextStyle(
        fontSize: 28,
        height: 1.1,
        fontWeight: FontWeight.w800,
        letterSpacing: -.6,
        color: pine,
      ),
      titleLarge: TextStyle(
        fontSize: 21,
        height: 1.2,
        fontWeight: FontWeight.w700,
        color: pine,
      ),
      titleMedium: TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.w700,
        color: pine,
      ),
      bodyLarge: TextStyle(fontSize: 16, height: 1.45, color: muted),
      bodyMedium: TextStyle(fontSize: 14, height: 1.4, color: muted),
      bodySmall: TextStyle(fontSize: 12, height: 1.4, color: muted),
      labelLarge: TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.transparent,
      foregroundColor: pine,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
        fontFamily: 'Roboto',
        fontSize: 19,
        fontWeight: FontWeight.w800,
        color: pine,
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: const Color(0xEE18252F),
      barrierColor: const Color(0x80070C12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: orange,
        foregroundColor: cream,
        minimumSize: const Size(48, 54),
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
        textStyle: const TextStyle(
          fontFamily: 'Roboto',
          fontWeight: FontWeight.w800,
          fontSize: 15,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: pine,
        backgroundColor: const Color(0x9514232D),
        minimumSize: const Size(48, 52),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
        side: const BorderSide(color: rule),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    iconButtonTheme: IconButtonThemeData(
      style: IconButton.styleFrom(
        foregroundColor: pine,
        minimumSize: const Size(48, 48),
      ),
    ),
    snackBarTheme: const SnackBarThemeData(
      backgroundColor: Color(0xFF263944),
      contentTextStyle: TextStyle(color: pine),
    ),
    sliderTheme: const SliderThemeData(trackHeight: 4),
    dividerTheme: const DividerThemeData(color: rule, space: 32),
  );
}

/// A full-bleed game lobby, also visible behind translucent native menus.
class DrivingBackdrop extends StatelessWidget {
  const DrivingBackdrop({
    super.key,
    this.road = 'alpine',
    this.showCar = false,
  });
  final String road;
  final bool showCar;

  @override
  Widget build(BuildContext context) => RepaintBoundary(
    child: ExcludeSemantics(
      child: CustomPaint(
        painter: _DrivingBackdropPainter(road: road, showCar: showCar),
        child: const SizedBox.expand(),
      ),
    ),
  );
}

class _DrivingBackdropPainter extends CustomPainter {
  const _DrivingBackdropPainter({required this.road, required this.showCar});
  final String road;
  final bool showCar;

  @override
  void paint(Canvas canvas, Size size) {
    final snow = road == 'snow';
    final jungle = road == 'jungle';
    final sky = snow ? const Color(0xFF738C99) : const Color(0xFF7E8C89);
    final horizon = snow ? const Color(0xFFB4B6AA) : const Color(0xFFB6A17C);
    final bounds = Offset.zero & size;
    canvas.drawRect(
      bounds,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [const Color(0xFF152A38), sky, horizon],
          stops: const [0, .5, 1],
        ).createShader(bounds),
    );
    canvas.save();
    canvas.scale(size.width / 1000, size.height / 500);
    canvas.drawCircle(
      const Offset(760, 154),
      50,
      Paint()
        ..color = const Color(0x35F5D5A4)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 24),
    );
    canvas.drawCircle(
      const Offset(760, 154),
      20,
      Paint()..color = const Color(0xFFE8CBA5),
    );
    Path ridge(List<Offset> points) {
      final path = Path()
        ..moveTo(0, 500)
        ..lineTo(points.first.dx, points.first.dy);
      for (final point in points.skip(1)) {
        path.lineTo(point.dx, point.dy);
      }
      return path
        ..lineTo(1000, 500)
        ..close();
    }

    canvas.drawPath(
      ridge(const [
        Offset(0, 251),
        Offset(84, 195),
        Offset(175, 221),
        Offset(300, 92),
        Offset(435, 231),
        Offset(562, 135),
        Offset(703, 253),
        Offset(851, 185),
        Offset(1000, 249),
      ]),
      Paint()..color = const Color(0xFF536976),
    );
    canvas.drawPath(
      ridge(const [
        Offset(0, 269),
        Offset(151, 178),
        Offset(270, 276),
        Offset(399, 245),
        Offset(545, 296),
        Offset(701, 209),
        Offset(887, 281),
        Offset(1000, 216),
      ]),
      Paint()..color = snow ? const Color(0xFF85999D) : const Color(0xFF354D53),
    );
    if (snow) {
      canvas.drawPath(
        Path()
          ..moveTo(238, 161)
          ..lineTo(300, 92)
          ..lineTo(368, 162)
          ..lineTo(317, 143)
          ..lineTo(293, 165)
          ..lineTo(274, 144)
          ..close(),
        Paint()..color = const Color(0xFFD6E0DD),
      );
      canvas.drawPath(
        Path()
          ..moveTo(509, 171)
          ..lineTo(562, 135)
          ..lineTo(604, 175)
          ..lineTo(564, 161)
          ..lineTo(545, 175)
          ..close(),
        Paint()..color = const Color(0xFFC7D6D7),
      );
    }
    canvas.drawRect(
      const Rect.fromLTWH(0, 290, 1000, 210),
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: snow
              ? const [Color(0xFF8EAAA9), Color(0xFF4D686F)]
              : [
                  jungle ? const Color(0xFF243D35) : const Color(0xFF384C40),
                  const Color(0xFF122329),
                ],
        ).createShader(const Rect.fromLTWH(0, 290, 1000, 210)),
    );
    // Distant tree lines, with natural spacing rather than repeated SVG icons.
    for (var i = 0; i < 44; i++) {
      final x = i * 25.0;
      final height = 24.0 + (i * 17 % 31);
      final y = 311.0 + (i * 13 % 11);
      final tree = Path()
        ..moveTo(x, y - height)
        ..lineTo(x - height * .28, y)
        ..lineTo(x + height * .28, y)
        ..close();
      canvas.drawPath(
        tree,
        Paint()
          ..color = snow ? const Color(0xFF3C5A5D) : const Color(0xFF1D3432),
      );
    }
    final verge = Path()
      ..moveTo(510, 294)
      ..cubicTo(525, 332, 670, 348, 1030, 500)
      ..lineTo(267, 500)
      ..cubicTo(510, 365, 489, 337, 502, 294)
      ..close();
    canvas.drawPath(
      verge,
      Paint()..color = snow ? const Color(0xFFB9C8C5) : const Color(0xFF8D8D6B),
    );
    final track = Path()
      ..moveTo(506, 294)
      ..cubicTo(516, 331, 655, 349, 1000, 500)
      ..lineTo(300, 500)
      ..cubicTo(519, 367, 494, 336, 504, 294)
      ..close();
    canvas.drawPath(
      track,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFF5B6567), Color(0xFF242F37)],
        ).createShader(const Rect.fromLTWH(300, 294, 700, 206)),
    );
    final edge = Paint()
      ..color = const Color(0xFFC2BCA4)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    canvas.drawPath(
      Path()
        ..moveTo(507, 300)
        ..cubicTo(520, 337, 663, 352, 982, 500),
      edge,
    );
    canvas.drawPath(
      Path()
        ..moveTo(502, 300)
        ..cubicTo(495, 336, 515, 367, 316, 500),
      edge,
    );
    for (var i = 0; i < 7; i++) {
      final t = (i + 1) / 8;
      final y = 306 + 195 * t * t;
      final x = 505 + 110 * t * t;
      canvas.drawLine(
        Offset(x, y),
        Offset(x + 3 + t * 7, y + 2 + t * 13),
        Paint()
          ..color = const Color(0xFFBAC1B8)
          ..strokeWidth = 1 + t * 4,
      );
    }
    // Low guardrail catches the evening light along the outside of the bend.
    final rail = Path()
      ..moveTo(525, 313)
      ..cubicTo(602, 342, 794, 351, 1020, 428);
    canvas.drawPath(
      rail,
      Paint()
        ..color = const Color(0xFF9DA5A0)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 4,
    );
    for (var i = 0; i < 13; i++) {
      final t = i / 12;
      final x = 533 + 480 * t;
      final y = 315 + 25 * t + 79 * t * t;
      canvas.drawLine(
        Offset(x, y),
        Offset(x, y + 9 + 11 * t),
        Paint()
          ..color = const Color(0xFF718382)
          ..strokeWidth = 2 + t * 2,
      );
    }
    if (showCar) {
      canvas.save();
      canvas.translate(630, 343);
      canvas.scale(1.2);
      canvas.drawOval(
        const Rect.fromLTWH(-18, 65, 234, 35),
        Paint()
          ..color = const Color(0xAA081219)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 10),
      );
      final tyre = Paint()..color = const Color(0xFF111A20);
      for (final wheel in const [
        Rect.fromLTWH(6, 43, 39, 50),
        Rect.fromLTWH(167, 31, 33, 42),
      ]) {
        canvas.drawRRect(
          RRect.fromRectAndRadius(wheel, const Radius.circular(9)),
          tyre,
        );
        canvas.drawRRect(
          RRect.fromRectAndRadius(wheel.deflate(6), const Radius.circular(5)),
          Paint()..color = const Color(0xFF28353C),
        );
        canvas.drawOval(
          Rect.fromCenter(center: wheel.center, width: 14, height: 26),
          Paint()..color = const Color(0xFF748086),
        );
      }
      final body = Path()
        ..moveTo(17, 62)
        ..lineTo(67, 38)
        ..lineTo(131, 24)
        ..lineTo(176, 38)
        ..lineTo(203, 58)
        ..lineTo(156, 72)
        ..lineTo(90, 85)
        ..lineTo(36, 80)
        ..close();
      canvas.drawPath(
        body,
        Paint()
          ..shader = const LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFFFFC184), Color(0xFFE98945), Color(0xFF9E4B25)],
          ).createShader(const Rect.fromLTWH(17, 24, 186, 61)),
      );
      canvas.drawPath(
        Path()
          ..moveTo(36, 62)
          ..lineTo(81, 49)
          ..lineTo(111, 31)
          ..lineTo(140, 34)
          ..lineTo(138, 49)
          ..lineTo(92, 68)
          ..close(),
        Paint()..color = const Color(0xFF172831),
      );
      canvas.drawPath(
        Path()
          ..moveTo(89, 48)
          ..lineTo(112, 32)
          ..lineTo(133, 36)
          ..lineTo(129, 47)
          ..close(),
        Paint()..color = const Color(0xFF5F7D87),
      );
      canvas.drawPath(
        Path()
          ..moveTo(57, 76)
          ..lineTo(117, 60)
          ..lineTo(158, 48),
        Paint()
          ..color = const Color(0xFFFFD1A2)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2,
      );
      canvas.drawPath(
        Path()
          ..moveTo(10, 66)
          ..lineTo(58, 54)
          ..lineTo(61, 64)
          ..lineTo(14, 79)
          ..close(),
        Paint()..color = const Color(0xFF263741),
      );
      canvas.drawLine(
        const Offset(20, 70),
        const Offset(16, 53),
        Paint()
          ..color = const Color(0xFF45565E)
          ..strokeWidth = 3,
      );
      canvas.drawLine(
        const Offset(51, 61),
        const Offset(48, 44),
        Paint()
          ..color = const Color(0xFF45565E)
          ..strokeWidth = 3,
      );
      canvas.drawPath(
        Path()
          ..moveTo(1, 49)
          ..lineTo(55, 33)
          ..lineTo(61, 43)
          ..lineTo(8, 60)
          ..close(),
        Paint()..color = const Color(0xFF14232C),
      );
      canvas.drawLine(
        const Offset(5, 49),
        const Offset(55, 35),
        Paint()
          ..color = orange
          ..strokeWidth = 2,
      );
      canvas.drawPath(
        Path()
          ..moveTo(150, 73)
          ..lineTo(205, 57)
          ..lineTo(217, 65)
          ..lineTo(164, 83)
          ..close(),
        Paint()..color = const Color(0xFF14232C),
      );
      canvas.restore();
    }
    canvas.restore();
    canvas.drawRect(
      bounds,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.centerLeft,
          end: Alignment.centerRight,
          colors: [Color(0xF00B141B), Color(0x850B141B), Color(0x150B141B)],
          stops: [0, .46, 1],
        ).createShader(bounds),
    );
    canvas.drawRect(
      bounds,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0x550B141B), Color(0x000B141B), Color(0xCC0B141B)],
          stops: [0, .5, 1],
        ).createShader(bounds),
    );
  }

  @override
  bool shouldRepaint(_DrivingBackdropPainter oldDelegate) =>
      oldDelegate.road != road || oldDelegate.showCar != showCar;
}
