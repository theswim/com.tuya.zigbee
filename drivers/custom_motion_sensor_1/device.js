'use strict';

const { Cluster } = require('zigbee-clusters');
const { CLUSTER } = require('zigbee-clusters');

const TuyaSpecificCluster = require('../../lib/TuyaSpecificCluster');
const TuyaSpecificClusterDevice = require('../../lib/TuyaSpecificClusterDevice');
const { getDataValue } = require('../../lib/TuyaHelpers');

Cluster.addCluster(TuyaSpecificCluster);

const LOG_MARKER = '[CUSTOM_MOTION_SENSOR_1]';

const TUYA_DPS_GUESSES = {
  motionState: 1,
  batteryPercentage: 4,
  temperature: 5,
  sensitivity: 9,
  presenceTime: 10,
  illuminanceLux: 12,
  intervalTime: 102,
  humidity: 101,
  illuminanceAlt: 102,
  humidityCalibration: 103,
  samplingTime: 104,
};

class CustomMotionSensor1 extends TuyaSpecificClusterDevice {
  async onNodeInit({ zclNode }) {
    this.printNode();

    this._motionClearTimeout = null;
    this._lastIlluminanceUpdateAt = 0;

    this._attachZigbeeClusterListeners(zclNode);
    this._attachTuyaClusterListeners(zclNode);

    await this._readBasicAttributes(zclNode);

    this.homey.setTimeout(() => {
      this._applyAllSettings().catch(err => this.error(LOG_MARKER, 'apply settings failed', err));
    }, 2000);
  }

  _attachZigbeeClusterListeners(zclNode) {
    const iasEp = this._findFirstEndpointWithCluster(zclNode, CLUSTER.IAS_ZONE.NAME);
    if (iasEp) {
      const iasCluster = iasEp.clusters[CLUSTER.IAS_ZONE.NAME];
      if (iasCluster && typeof iasCluster.on === 'function') {
        iasCluster.on('attr.zoneStatus', status => this._handleZoneStatus(status));
      }
      if (iasCluster) {
        iasCluster.onZoneStatusChangeNotification = payload => {
          this._handleZoneStatus(payload.zoneStatus);
        };
      }
    }

    const powerEp = this._findFirstEndpointWithCluster(zclNode, CLUSTER.POWER_CONFIGURATION.NAME);
    if (powerEp) {
      powerEp.clusters[CLUSTER.POWER_CONFIGURATION.NAME]
        .on('attr.batteryPercentageRemaining', value => this._handleBattery(value));
    }

    const tempEp = this._findFirstEndpointWithCluster(zclNode, CLUSTER.TEMPERATURE_MEASUREMENT.NAME);
    if (tempEp) {
      tempEp.clusters[CLUSTER.TEMPERATURE_MEASUREMENT.NAME]
        .on('attr.measuredValue', value => this._handleTemperature(value));
    }

    const humidEp = this._findFirstEndpointWithCluster(zclNode, CLUSTER.RELATIVE_HUMIDITY_MEASUREMENT.NAME);
    if (humidEp) {
      humidEp.clusters[CLUSTER.RELATIVE_HUMIDITY_MEASUREMENT.NAME]
        .on('attr.measuredValue', value => this._handleHumidity(value));
    }

    const illumEp = this._findFirstEndpointWithCluster(zclNode, CLUSTER.ILLUMINANCE_MEASUREMENT.NAME);
    if (illumEp) {
      illumEp.clusters[CLUSTER.ILLUMINANCE_MEASUREMENT.NAME]
        .on('attr.measuredValue', value => this._handleIlluminanceMeasuredValue(value));
    }
  }

  _attachTuyaClusterListeners(zclNode) {
    const tuyaEp = zclNode.endpoints && zclNode.endpoints[1] && zclNode.endpoints[1].clusters
      ? zclNode.endpoints[1]
      : null;

    if (!tuyaEp || !tuyaEp.clusters || !tuyaEp.clusters.tuya) return;

    tuyaEp.clusters.tuya.on('reporting', value => this._handleTuyaDatapoint(value));
    tuyaEp.clusters.tuya.on('response', value => this._handleTuyaDatapoint(value));
  }

  async _readBasicAttributes(zclNode) {
    try {
      const { manufacturerName, modelId } = await zclNode.endpoints[1].clusters.basic.readAttributes([
        'manufacturerName',
        'modelId',
      ]);
      this.log(LOG_MARKER, 'device', { manufacturerName, modelId });
    } catch (err) {
      this.error(LOG_MARKER, 'Error reading basic attributes', err);
    }
  }

  _handleZoneStatus(zoneStatus) {
    try {
      const isMotion = Boolean(zoneStatus && zoneStatus.alarm1);
      this.log(LOG_MARKER, 'motion', { isMotion, zoneStatus });

      if (isMotion) {
        this._scheduleMotionClear();
      } else {
        this._clearMotionTimer();
      }

      this.setCapabilityValue('alarm_motion', isMotion).catch(this.error);
      if (zoneStatus && typeof zoneStatus.battery === 'boolean') {
        this.setCapabilityValue('alarm_battery', zoneStatus.battery).catch(this.error);
      }
    } catch (err) {
      this.error(LOG_MARKER, 'Error handling IAS zoneStatus', err);
    }
  }

  _scheduleMotionClear() {
    this._clearMotionTimer();

    const seconds = this._clampInt(this.getSetting('presence_time_seconds'), 1, 1500);
    this._motionClearTimeout = this.homey.setTimeout(() => {
      this.log(LOG_MARKER, 'motion auto-clear', { seconds });
      this.setCapabilityValue('alarm_motion', false).catch(this.error);
      this._motionClearTimeout = null;
    }, seconds * 1000);
  }

  _clearMotionTimer() {
    if (this._motionClearTimeout) {
      this.homey.clearTimeout(this._motionClearTimeout);
      this._motionClearTimeout = null;
    }
  }

  _handleBattery(batteryPercentageRemaining) {
    const batteryThreshold = this.getSetting('batteryThreshold') || 20;
    const batteryPct = batteryPercentageRemaining / 2;
    this.log(LOG_MARKER, 'battery', { batteryPct });
    this.setCapabilityValue('measure_battery', batteryPct).catch(this.error);
    this.setCapabilityValue('alarm_battery', batteryPct < batteryThreshold).catch(this.error);
  }

  _handleTemperature(measuredValue) {
    const temperatureOffset = Number(this.getSetting('temperature_offset') || 0);
    const value = measuredValue / 100;
    const calibrated = Math.round((value + temperatureOffset) * 10) / 10;
    this.log(LOG_MARKER, 'temperature', { value, temperatureOffset, calibrated });
    this.setCapabilityValue('measure_temperature', calibrated).catch(this.error);
  }

  _handleHumidity(measuredValue) {
    const humidityOffset = Number(this.getSetting('humidity_offset') || 0);
    const value = measuredValue / 100;
    const calibrated = Math.round((value + humidityOffset) * 10) / 10;
    this.log(LOG_MARKER, 'humidity', { value, humidityOffset, calibrated });
    this.setCapabilityValue('measure_humidity', calibrated).catch(this.error);
  }

  _handleIlluminanceMeasuredValue(measuredValue) {
    const intervalMinutes = this._clampInt(this.getSetting('illuminance_sampling_interval_minutes'), 1, 480);
    const intervalMs = intervalMinutes * 60 * 1000;
    const now = Date.now();

    if (this._lastIlluminanceUpdateAt && (now - this._lastIlluminanceUpdateAt) < intervalMs) {
      return;
    }

    const lux = 10 ** ((measuredValue - 1) / 10000);
    const parsedValue = Math.round(lux);
    this._lastIlluminanceUpdateAt = now;
    this.log(LOG_MARKER, 'luminance', { lux: parsedValue, intervalMinutes });
    this.setCapabilityValue('measure_luminance', parsedValue).catch(this.error);
  }

  async _handleTuyaDatapoint(data) {
    try {
      const dp = data.dp;
      const dataType = data.datatype;
      const rawHex = Buffer.isBuffer(data.data) ? data.data.toString('hex') : String(data.data);
      const parsedValue = getDataValue(data);

      this.log(LOG_MARKER, 'tuya dp', { dp, dataType, rawHex, parsedValue });

      if (dp === TUYA_DPS_GUESSES.motionState) {
        const isMotion = parsedValue === 1;
        if (isMotion) this._scheduleMotionClear();
        this.setCapabilityValue('alarm_motion', isMotion).catch(this.error);
      }

      if (dp === TUYA_DPS_GUESSES.batteryPercentage) {
        const batteryThreshold = this.getSetting('batteryThreshold') || 20;
        const batteryPct = Number(parsedValue);
        if (Number.isFinite(batteryPct)) {
          this.setCapabilityValue('measure_battery', batteryPct).catch(this.error);
          this.setCapabilityValue('alarm_battery', batteryPct < batteryThreshold).catch(this.error);
        }
      }

      if (dp === TUYA_DPS_GUESSES.temperature) {
        const temperatureOffset = Number(this.getSetting('temperature_offset') || 0);
        const value = Number(parsedValue) / 10;
        if (Number.isFinite(value)) {
          const calibrated = Math.round((value + temperatureOffset) * 10) / 10;
          this.setCapabilityValue('measure_temperature', calibrated).catch(this.error);
        }
      }

      if (dp === TUYA_DPS_GUESSES.humidity) {
        const humidityOffset = Number(this.getSetting('humidity_offset') || 0);
        const value = Number(parsedValue);
        if (Number.isFinite(value)) {
          const calibrated = Math.round((value + humidityOffset) * 10) / 10;
          this.setCapabilityValue('measure_humidity', calibrated).catch(this.error);
        }
      }

      if (dp === TUYA_DPS_GUESSES.illuminanceLux) {
        const intervalMinutes = this._clampInt(this.getSetting('illuminance_sampling_interval_minutes'), 1, 480);
        const intervalMs = intervalMinutes * 60 * 1000;
        const now = Date.now();
        if (!this._lastIlluminanceUpdateAt || (now - this._lastIlluminanceUpdateAt) >= intervalMs) {
          this._lastIlluminanceUpdateAt = now;
          this.setCapabilityValue('measure_luminance', Number(parsedValue)).catch(this.error);
        }
      }

      if (dp === TUYA_DPS_GUESSES.illuminanceAlt) {
        const intervalMinutes = this._clampInt(this.getSetting('illuminance_sampling_interval_minutes'), 1, 480);
        const intervalMs = intervalMinutes * 60 * 1000;
        const now = Date.now();
        if (!this._lastIlluminanceUpdateAt || (now - this._lastIlluminanceUpdateAt) >= intervalMs) {
          this._lastIlluminanceUpdateAt = now;
          this.setCapabilityValue('measure_luminance', Number(parsedValue)).catch(this.error);
        }
      }
    } catch (err) {
      this.error(LOG_MARKER, 'Error handling Tuya datapoint', err);
    }
  }

  async _applyAllSettings() {
    const settings = this.getSettings();
    this.log(LOG_MARKER, 'apply (local only)', {
      presence_time_seconds: settings.presence_time_seconds,
      motion_sensitivity: settings.motion_sensitivity,
      illuminance_sampling_interval_minutes: settings.illuminance_sampling_interval_minutes,
      temperature_offset: settings.temperature_offset,
      humidity_offset: settings.humidity_offset,
    });
  }

  async onSettings({ newSettings, changedKeys }) {
    try {
      if (changedKeys.includes('presence_time_seconds')) {
        const seconds = this._clampInt(newSettings.presence_time_seconds, 1, 1500);
        this.log(LOG_MARKER, 'set presence_time_seconds', { seconds });
      }

      if (changedKeys.includes('motion_sensitivity')) {
        const value = this._clampInt(newSettings.motion_sensitivity, 0, 19);
        this.log(LOG_MARKER, 'set motion_sensitivity', { value });
      }

      if (changedKeys.includes('illuminance_sampling_interval_minutes')) {
        const value = this._clampInt(newSettings.illuminance_sampling_interval_minutes, 1, 480);
        this.log(LOG_MARKER, 'set illuminance_sampling_interval_minutes', { value });
      }
    } catch (err) {
      this.error(LOG_MARKER, 'Error in onSettings', err);
    }
  }

  _findFirstEndpointWithCluster(zclNode, clusterName) {
    if (!zclNode || !zclNode.endpoints) return null;
    const eps = Object.values(zclNode.endpoints);
    for (const ep of eps) {
      if (ep && ep.clusters && ep.clusters[clusterName]) return ep;
    }
    return null;
  }

  _clampInt(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, Math.trunc(n)));
  }

  onDeleted() {
    this._clearMotionTimer();
    this.log(LOG_MARKER, 'Device removed');
  }
}

module.exports = CustomMotionSensor1;
