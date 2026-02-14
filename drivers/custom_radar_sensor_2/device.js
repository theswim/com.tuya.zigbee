'use strict';

const { Cluster } = require('zigbee-clusters');
const TuyaSpecificCluster = require('../../lib/TuyaSpecificCluster');
const TuyaSpecificClusterDevice = require('../../lib/TuyaSpecificClusterDevice');

Cluster.addCluster(TuyaSpecificCluster);

const dataTypes = {
  raw: 0, // [ bytes ]
  bool: 1, // [0/1]
  value: 2, // [ 4 byte value ]
  string: 3, // [ N byte string ]
  enum: 4, // [ 0-255 ]
  bitmap: 5, // [ 1,2,4 bytes ] as bits
};

const convertMultiByteNumberPayloadToSingleDecimalNumber = (chunks) => {
  let value = 0;
  for (let i = 0; i < chunks.length; i++) {
    value = value << 8;
    value += chunks[i];
  }
  return value;
};

class CustomRadarSensor2 extends TuyaSpecificClusterDevice {
  async onNodeInit({ zclNode }) {
    this.printNode();

    // Attach event listeners for Tuya-specific reports
    if (!this.hasListenersAttached) {
      zclNode.endpoints[1].clusters.tuya.on('reporting', async (value) => {
        try {
          this.log('Received reporting:', JSON.stringify(value, null, 2));
          await this.processDatapoint(value);
        } catch (err) {
          this.error('Error processing datapoint:', err);
        }
      });

      zclNode.endpoints[1].clusters.tuya.on('response', async (value) => {
        try {
          this.log('Received response:', JSON.stringify(value, null, 2));
          await this.processDatapoint(value);
        } catch (err) {
          this.error('Error processing datapoint:', err);
        }
      });

      this.hasListenersAttached = true;
    }
  }

  // Process DP reports and update Homey accordingly
  async processDatapoint(data) {
    const dp = data.dp;
    const datatype = data.datatype;

    this.log(`Processing DP ${dp}, Data Type: ${datatype}, Data:`, data.data);

    // DP 1 contains 19-byte composite data
    if (dp === 1 && data.data && data.data.length === 19) {
      this.parseCompositeData(data.data);
      return;
    }

    // Handle individual DPs
    switch (dp) {
      case 1:
        // Presence state (single byte)
        if (data.data && data.data.length === 1) {
          const presenceState = data.data[0];
          this.log('Presence state (DP1):', presenceState);
          this.setCapabilityValue('alarm_motion', presenceState === 0).catch(this.error);
        }
        break;

      case 9:
        // Radar sensitivity
        if (data.data && data.data.length === 1) {
          const sensitivity = data.data[0];
          this.log('Radar sensitivity (DP9):', sensitivity);
          this._currentSensitivity = sensitivity;
        }
        break;

      case 10:
        // Detection time/delay
        if (data.data && data.data.length === 1) {
          const detectionTime = data.data[0];
          this.log('Detection time (DP10):', detectionTime);
          this._currentDetectionTime = detectionTime;
        }
        break;

      default:
        this.log('Unhandled DP:', dp, 'Data:', data.data);
    }
  }

  // Parse 19-byte composite data structure
  parseCompositeData(buffer) {
    this.log('Parsing 19-byte composite data:', buffer);

    // Byte 0: Presence state (0 = presence detected, 1 = no presence)
    const presenceState = buffer[0];
    this.log('Presence state:', presenceState);
    this.setCapabilityValue('alarm_motion', presenceState === 0).catch(this.error);

    // Bytes 1-8: Battery level data
    // Format: [4, 2, 0, 4, 0, 0, 0, 100]
    // Last 4 bytes (4-7) contain battery percentage
    if (buffer.length >= 8) {
      const batteryValue = convertMultiByteNumberPayloadToSingleDecimalNumber([buffer[5], buffer[6], buffer[7], buffer[8]]);
      this.log('Battery level:', batteryValue);

      const batteryThreshold = this.getSetting('batteryThreshold') || 20;
      this.setCapabilityValue('measure_battery', batteryValue).catch(this.error);
      this.setCapabilityValue('alarm_battery', batteryValue < batteryThreshold).catch(this.error);
    }

    // Bytes 9-13: DP 9 - Radar sensitivity
    // Format: [9, 4, 0, 1, value]
    if (buffer.length >= 13 && buffer[9] === 9) {
      const sensitivity = buffer[13];
      this.log('Radar sensitivity:', sensitivity);
      // Store for settings synchronization
      this._currentSensitivity = sensitivity;
    }

    // Bytes 14-18: DP 10 - Detection time/delay
    // Format: [10, 4, 0, 1, value]
    if (buffer.length >= 18 && buffer[14] === 10) {
      const detectionTime = buffer[18];
      this.log('Detection time:', detectionTime);
      // Store for settings synchronization
      this._currentDetectionTime = detectionTime;
    }
  }

  async onSettings({ newSettings, changedKeys }) {
    try {
      if (changedKeys.includes('radar_sensitivity')) {
        this.log('Setting radar sensitivity to:', newSettings['radar_sensitivity']);
        await this.writeEnum(9, newSettings['radar_sensitivity']);
      }

      if (changedKeys.includes('detection_time')) {
        this.log('Setting detection time to:', newSettings['detection_time']);
        await this.writeEnum(10, newSettings['detection_time']);
      }
    } catch (error) {
      this.error('Error in onSettings:', error);
      throw error;
    }
  }

  onDeleted() {
    this.log('10GHz mmWave Presence Sensor (Battery) removed');
  }
}

module.exports = CustomRadarSensor2;
