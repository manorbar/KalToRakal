const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const WORKMANAGER_PROGUARD_RULES = `
# Keep AndroidX WorkManager, Room Database_Impl & Startup classes from being stripped/obfuscated by R8
-keep class androidx.work.impl.WorkDatabase { *; }
-keep class androidx.work.impl.WorkDatabase_Impl { *; }
-keep class * extends androidx.room.RoomDatabase { *; }
-keep class androidx.work.** { *; }
-keep class androidx.room.** { *; }
-keep class androidx.startup.** { *; }
`;

module.exports = function withWorkManagerProguard(config) {
  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const proguardPath = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app',
        'proguard-rules.pro'
      );
      if (fs.existsSync(proguardPath)) {
        const current = fs.readFileSync(proguardPath, 'utf8');
        if (!current.includes('androidx.work.impl.WorkDatabase_Impl')) {
          fs.writeFileSync(
            proguardPath,
            current + '\n' + WORKMANAGER_PROGUARD_RULES,
            'utf8'
          );
        }
      }
      return modConfig;
    },
  ]);
};
