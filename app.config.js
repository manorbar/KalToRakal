const baseConfig = require('./app.json');

module.exports = () => {
  const androidGoogleMapsApiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;

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
      [
        'react-native-maps',
        {
          ...(androidGoogleMapsApiKey ? { androidGoogleMapsApiKey } : {}),
        },
      ],
    ],
  };
};
