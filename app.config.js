const baseConfig = require('./app.json');

module.exports = () => {
  const androidGoogleMapsApiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;

  if (
    process.env.EAS_BUILD_PLATFORM === 'android' &&
    !androidGoogleMapsApiKey
  ) {
    throw new Error(
      'Missing GOOGLE_MAPS_ANDROID_API_KEY during Android EAS build! Run: npx eas-cli env:create --name GOOGLE_MAPS_ANDROID_API_KEY --value "YOUR_KEY" --scope project --visibility secret --environment preview --environment production'
    );
  }

  return {
    ...baseConfig.expo,
    android: {
      ...baseConfig.expo.android,
      config: {
        ...(baseConfig.expo.android?.config || {}),
        ...(androidGoogleMapsApiKey
          ? {
              googleMaps: {
                apiKey: androidGoogleMapsApiKey,
              },
            }
          : {}),
      },
    },
    plugins: [
      ...(baseConfig.expo.plugins || []),
      './plugins/withWorkManagerProguard',
      [
        'react-native-maps',
        {
          ...(androidGoogleMapsApiKey ? { androidGoogleMapsApiKey } : {}),
        },
      ],
    ],
  };
};
