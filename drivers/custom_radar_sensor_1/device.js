'use strict';

const { Cluster } = require('zigbee-clusters');
const TuyaSpecificCluster = require('../../lib/TuyaSpecificCluster');
const TuyaSpecificClusterDevice = require('../../lib/TuyaSpecificClusterDevice');
const { getDataValue } = require('../../lib/TuyaHelpers');

Cluster.addCluster(TuyaSpecificCluster);

const LOG_MARKER = '[KA8L86IU_PRESENCE_RADAR]';

const DPS = {
  presenceState: 1,
  motionSensitivity: 123,
  detectionDistanceCm: 4,
  presenceKeepTime: 102,
  antiInterference: 107,
  stationarySensitivity: 2,
};

class PresenceRadarKa8l86iu extends TuyaSpecificClusterDevice {
  async onNodeInit({ zclNode }) {
    this.printNode();

    this._deviceIdTag = (this.getData && this.getData() && this.getData().id)
      ? this.getData().id
      : this.getName();

    zclNode.endpoints[1].clusters.tuya.on('reporting', value => this._handleTuyaDatapoint(value));
    zclNode.endpoints[1].clusters.tuya.on('response', value => this._handleTuyaDatapoint(value));

    await this._readBasicAttributes(zclNode);

    this.homey.setTimeout(() => {
      this._applyAllSettings().catch(err => this.error(LOG_MARKER, 'apply settings failed', err));
    }, 2000);
  }

  async _readBasicAttributes(zclNode) {
    try {
      const { manufacturerName, modelId } = await zclNode.endpoints[1].clusters.basic.readAttributes([
        'manufacturerName',
        'modelId',
      ]);
      this.log(LOG_MARKER, 'device', { deviceId: this._deviceIdTag, manufacturerName, modelId });
    } catch (err) {
      this.error(LOG_MARKER, 'Error reading basic attributes', err);
    }
  }

  async _handleTuyaDatapoint(data) {
    try {
      const dp = data.dp;
      const dataType = data.datatype;
      const rawHex = Buffer.isBuffer(data.data) ? data.data.toString('hex') : String(data.data);
      const parsedValue = getDataValue(data);

      this.log(LOG_MARKER, 'dp', { deviceId: this._deviceIdTag, dp, dataType, rawHex, parsedValue });

      if (dp === DPS.presenceState) {
        await this.setCapabilityValue('alarm_motion', parsedValue === 1).catch(this.error);
      }
    } catch (err) {
      this.error(LOG_MARKER, 'Error handling Tuya datapoint', err);
    }
  }

  async _applyAllSettings() {
    const settings = this.getSettings();

    const presenceKeepTime = this._clampInt(settings.presence_keep_time, 0, 1500);
    const detectionDistanceCm = this._clampInt(settings.mw_radar_detection_distance, 0, 500);
    const motionSensitivity = this._clampInt(settings.motion_detection_sensitivity, 0, 10);
    const stationarySensitivity = this._clampInt(settings.stationary_detection_sensitivity, 0, 10);
    const antiInterference = Boolean(settings.anti_interference);

    this.log(LOG_MARKER, 'apply', {
      deviceId: this._deviceIdTag,
      presenceKeepTime,
      detectionDistanceCm,
      motionSensitivity,
      stationarySensitivity,
      antiInterference,
    });

    await this.writeData32(DPS.presenceKeepTime, presenceKeepTime);
    await this.writeData32(DPS.detectionDistanceCm, detectionDistanceCm);
    await this.writeData32(DPS.motionSensitivity, motionSensitivity);
    await this.writeData32(DPS.stationarySensitivity, stationarySensitivity);
    await this.writeBool(DPS.antiInterference, antiInterference);
  }

  async onSettings({ newSettings, changedKeys }) {
    try {
      if (changedKeys.includes('presence_keep_time')) {
        const value = this._clampInt(newSettings.presence_keep_time, 0, 1500);
        this.log(LOG_MARKER, 'set', { deviceId: this._deviceIdTag, dp: DPS.presenceKeepTime, value });
        await this.writeData32(DPS.presenceKeepTime, value);
      }

      if (changedKeys.includes('mw_radar_detection_distance')) {
        const value = this._clampInt(newSettings.mw_radar_detection_distance, 0, 500);
        this.log(LOG_MARKER, 'set', { deviceId: this._deviceIdTag, dp: DPS.detectionDistanceCm, value });
        await this.writeData32(DPS.detectionDistanceCm, value);
      }

      if (changedKeys.includes('motion_detection_sensitivity')) {
        const value = this._clampInt(newSettings.motion_detection_sensitivity, 0, 10);
        this.log(LOG_MARKER, 'set', { deviceId: this._deviceIdTag, dp: DPS.motionSensitivity, value });
        await this.writeData32(DPS.motionSensitivity, value);
      }

      if (changedKeys.includes('stationary_detection_sensitivity')) {
        const value = this._clampInt(newSettings.stationary_detection_sensitivity, 0, 10);
        this.log(LOG_MARKER, 'set', { deviceId: this._deviceIdTag, dp: DPS.stationarySensitivity, value });
        await this.writeData32(DPS.stationarySensitivity, value);
      }

      if (changedKeys.includes('anti_interference')) {
        const value = Boolean(newSettings.anti_interference);
        this.log(LOG_MARKER, 'set', { deviceId: this._deviceIdTag, dp: DPS.antiInterference, value });
        await this.writeBool(DPS.antiInterference, value);
      }
    } catch (err) {
      this.error(LOG_MARKER, 'Error in onSettings', err);
    }
  }

  _clampInt(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, Math.trunc(n)));
  }
}

module.exports = PresenceRadarKa8l86iu;
