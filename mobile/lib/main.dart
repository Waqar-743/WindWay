import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter/foundation.dart';

import 'app_model.dart';
import 'app_theme.dart';
import 'menu_screens.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  LicenseRegistry.addLicense(() async* {
    yield LicenseEntryWithLineBreaks([
      'Windway car artwork — MattsActuallyUsefulModels',
    ], await rootBundle.loadString('assets/art/MODEL_CREDITS.md'));
  });
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.landscapeLeft,
    DeviceOrientation.landscapeRight,
  ]);
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      systemNavigationBarColor: cream,
      statusBarIconBrightness: Brightness.light,
      systemNavigationBarIconBrightness: Brightness.light,
      systemNavigationBarDividerColor: Colors.transparent,
    ),
  );
  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  final model = await AppModel.load();
  runApp(WindwayApp(model: model));
}

class WindwayApp extends StatelessWidget {
  const WindwayApp({super.key, required this.model});
  final AppModel model;

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Windway',
    debugShowCheckedModeBanner: false,
    theme: windwayTheme(),
    home: StarterScreen(model: model),
  );
}
