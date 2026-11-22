const { withEntitlementsPlist } = require('@expo/config-plugins');

/**
 * KalToRakal uses only local notifications (Get-Off alerts), not remote APNs push.
 * Removing `aps-environment` allows signing with a free Apple Personal Team in Xcode.
 */
module.exports = function withLocalNotificationsOnly(config) {
  return withEntitlementsPlist(config, (modConfig) => {
    delete modConfig.modResults['aps-environment'];
    return modConfig;
  });
};
