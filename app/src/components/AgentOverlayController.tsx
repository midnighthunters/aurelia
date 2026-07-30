import React, {useEffect, useState} from 'react';
import {
  Modal,
  NativeEventEmitter,
  NativeModules,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {ActionExecutor} from '../agent/ActionExecutor';
import {TaskPlanner} from '../agent/TaskPlanner';

const OverlayNative = NativeModules.OverlayModule;

export function AgentOverlayController(): React.JSX.Element | null {
  const [plannerState, setPlannerState] = useState(TaskPlanner.getStatus());
  const [confirmationData, setConfirmationData] = useState<any>(null);

  useEffect(() => {
    // Check overlay permission & start service
    if (OverlayNative) {
      OverlayNative.canDrawOverlays().then((can: boolean) => {
        if (can) {
          OverlayNative.startOverlayService();
        } else {
          OverlayNative.requestOverlayPermission();
        }
      });

      // Listen for STOP button tap from floating overlay
      const emitter = new NativeEventEmitter(OverlayNative);
      const sub = emitter.addListener('onStopPressed', () => {
        ActionExecutor.abortActiveExecution();
      });
      return () => sub.remove();
    }
  }, []);

  useEffect(() => {
    const unsub = TaskPlanner.subscribe(state => {
      setPlannerState(state.status);
      if (state.status === 'awaiting_confirmation') {
        setConfirmationData(state.pendingConfirmation);
      } else {
        setConfirmationData(null);
      }
    });
    return () => unsub();
  }, []);

  if (confirmationData) {
    return (
      <Modal transparent visible animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>⚠️ Safety Confirmation Required</Text>
            <Text style={styles.modalDesc}>{confirmationData.description}</Text>

            {confirmationData.preview ? (
              <View style={styles.previewContainer}>
                {Object.entries(confirmationData.preview).map(([key, val]) => (
                  <Text key={key} style={styles.previewLine}>
                    <Text style={styles.bold}>{key}:</Text> {String(val)}
                  </Text>
                ))}
              </View>
            ) : null}

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.btn, styles.cancelBtn]}
                onPress={() => TaskPlanner.rejectPendingAction()}>
                <Text style={styles.btnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.confirmBtn]}
                onPress={() => TaskPlanner.confirmPendingAction()}>
                <Text style={styles.btnText}>Proceed & Execute</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1E1E2E',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: '#F38BA8',
  },
  modalTitle: {
    color: '#F38BA8',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  modalDesc: {
    color: '#CDD6F4',
    fontSize: 13,
    marginBottom: 12,
  },
  previewContainer: {
    backgroundColor: '#181825',
    borderRadius: 6,
    padding: 10,
    marginBottom: 16,
  },
  previewLine: {
    color: '#BAC2DE',
    fontSize: 12,
    marginBottom: 4,
  },
  bold: {
    fontWeight: 'bold',
    color: '#89B4FA',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  btn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  cancelBtn: {
    backgroundColor: '#45475A',
  },
  confirmBtn: {
    backgroundColor: '#A6E3A1',
  },
  btnText: {
    color: '#11111B',
    fontWeight: 'bold',
    fontSize: 13,
  },
});
