'use strict';

const { ZigBeeDevice } = require('homey-zigbeedriver');
const { debug, CLUSTER } = require('zigbee-clusters');

class custom_button_4_gang_1 extends ZigBeeDevice {

    async onNodeInit({ zclNode }) {

      debug(true);
      this.printNode();

      const node = await this.homey.zigbee.getNode(this);
      node.handleFrame = (endpointId, clusterId, frame, meta) => {
        if (clusterId === 6) {
          this.log("endpointId:", endpointId,", clusterId:", clusterId,", frame:", frame, ", meta:", meta);
          this.log("Frame JSON data:", frame.toJSON());
          this.buttonCommandParser(endpointId, frame);
        }
      };

      this._buttonPressedTriggerDevice = this.homey.flow.getDeviceTriggerCard('custom_button_4_gang_1_buttons_4')
      .registerRunListener(async (args, state) => {
        return (null, args.action === state.action);
      });
    }

    buttonCommandParser(ep, frame) {
      if(frame[0] !== 1) return;
      var button = ep === 1 ? 'leftUp' : ep === 2 ? 'rightUp' : ep === 3 ? 'leftDown' : 'rightDown';
      var action = frame[3] === 0 ? 'oneClick' : frame[3] === 1 ? 'twoClicks' : 'longPress';
      return this._buttonPressedTriggerDevice.trigger(this, {}, { action: `${button}-${action}` })
      .then(() => this.log(`Triggered Custom Button 4 Gang 1, action=${button}-${action}`))
      .catch(err => this.error('Error triggering Custom Button 4 Gang 1', err));
    }

    onDeleted() {
      this.log('Custom Button 4 Gang 1 removed');
    }

}

module.exports = custom_button_4_gang_1;

/*
  "ids": {
    "modelId": "TS0044",
    "manufacturerName": "_TZ3000_wkai4ga5"
  },
  "endpoints": {
    "endpointDescriptors": [
      {
        "endpointId": 1,
        "applicationProfileId": 260,
        "applicationDeviceId": 0,
        "applicationDeviceVersion": 0,
        "_reserved1": 1,
        "inputClusters": [
          0,
          1,
          6
        ],
        "outputClusters": [
          25,
          10
        ]
      },
      {
        "endpointId": 2,
        "applicationProfileId": 260,
        "applicationDeviceId": 0,
        "applicationDeviceVersion": 0,
        "_reserved1": 1,
        "inputClusters": [
          1,
          6
        ],
        "outputClusters": []
      },
      {
        "endpointId": 3,
        "applicationProfileId": 260,
        "applicationDeviceId": 0,
        "applicationDeviceVersion": 0,
        "_reserved1": 1,
        "inputClusters": [
          1,
          6
        ],
        "outputClusters": []
      },
      {
        "endpointId": 4,
        "applicationProfileId": 260,
        "applicationDeviceId": 0,
        "applicationDeviceVersion": 0,
        "_reserved1": 1,
        "inputClusters": [
          1,
          6
        ],
        "outputClusters": []
      }
    ],
    "endpoints": {
      "1": {
        "clusters": {
          "basic": {
            "attributes": [
              {
                "acl": [
                  "readable",
                  "reportable"
                ],
                "id": 0,
                "name": "zclVersion",
                "value": 3
              },
              {
                "acl": [
                  "readable",
                  "reportable"
                ],
                "id": 1,
                "name": "appVersion",
                "value": 66
              },
              {
                "acl": [
                  "readable",
                  "reportable"
                ],
                "id": 2,
                "name": "stackVersion",
                "value": 0
              },
              {
                "acl": [
                  "readable",
                  "reportable"
                ],
                "id": 3,
                "name": "hwVersion",
                "value": 1
              },
              {
                "acl": [
                  "readable",
                  "reportable"
                ],
                "id": 4,
                "name": "manufacturerName",
                "value": "_TZ3000_wkai4ga5"
              },
              {
                "acl": [
                  "readable",
                  "reportable"
                ],
                "id": 5,
                "name": "modelId",
                "value": "TS0044"
              },
              {
                "acl": [
                  "readable",
                  "reportable"
                ],
                "id": 6,
                "name": "dateCode",
                "value": ""
              },
              {
                "acl": [
                  "readable",
                  "reportable"
                ],
                "id": 7,
                "name": "powerSource",
                "value": "battery"
              },
              {
                "acl": [
                  "readable",
                  "writable",
                  "reportable"
                ],
                "id": 65502
              },
              {
                "acl": [
                  "readable",
                  "reportable"
                ],
                "id": 65533,
                "name": "clusterRevision",
                "value": 2
              },
              {
                "acl": [
                  "readable",
                  "reportable"
                ],
                "id": 65534,
                "name": "attributeReportingStatus",
                "value": "PENDING"
              },
              {
                "acl": [
                  "readable",
                  "reportable"
                ],
                "id": 65504
              },
              {
                "acl": [
                  "readable",
                  "reportable"
                ],
                "id": 65505
              },
              {
                "acl": [
                  "readable",
                  "reportable"
                ],
                "id": 65506
              },
              {
                "acl": [
                  "readable",
                  "reportable"
                ],
                "id": 65507
              }
            ]
          },
          "powerConfiguration": {},
          "onOff": {}
        },
        "bindings": {
          "ota": {},
          "time": {}
        }
      },
      "2": {
        "clusters": {
          "powerConfiguration": {},
          "onOff": {}
        },
        "bindings": {}
      },
      "3": {
        "clusters": {
          "powerConfiguration": {},
          "onOff": {}
        },
        "bindings": {}
      },
      "4": {
        "clusters": {
          "powerConfiguration": {},
          "onOff": {}
        },
        "bindings": {}
      }
    }
  }

*/


