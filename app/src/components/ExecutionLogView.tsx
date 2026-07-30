import React, {useEffect, useState} from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import {ExecutionLog, ExecutionStepLog} from '../agent/ExecutionLog';

export function ExecutionLogView(): React.JSX.Element {
  const [logs, setLogs] = useState<ExecutionStepLog[]>([]);

  useEffect(() => {
    const unsubscribe = ExecutionLog.subscribe(newLogs => {
      setLogs(newLogs);
    });
    return () => unsubscribe();
  }, []);

  if (logs.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No agent actions recorded yet.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>📜 Execution History Log</Text>
      {logs.map(log => {
        const timeStr = new Date(log.timestamp).toLocaleTimeString();
        const statusColor =
          log.status === 'success'
            ? '#2ECC71'
            : log.status === 'failed'
            ? '#E74C3C'
            : log.status === 'paused'
            ? '#F39C12'
            : log.status === 'aborted'
            ? '#95A5A6'
            : '#3498DB';

        const statusIcon =
          log.status === 'success'
            ? '✅'
            : log.status === 'failed'
            ? '❌'
            : log.status === 'paused'
            ? '🔒'
            : log.status === 'aborted'
            ? '⏹'
            : '⏳';

        return (
          <View key={log.id} style={styles.logCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.taskTitle}>
                {statusIcon} {log.taskTitle || 'Step ' + log.stepIndex}
              </Text>
              <Text style={styles.timeText}>{timeStr}</Text>
            </View>
            <Text style={styles.actionType}>
              Action: <Text style={styles.bold}>{log.actionType}</Text>
            </Text>
            <Text style={styles.details}>{log.details}</Text>
            {log.error ? <Text style={styles.errorText}>Error: {log.error}</Text> : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    maxHeight: 240,
    backgroundColor: '#181825',
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
  },
  emptyContainer: {
    padding: 16,
    alignItems: 'center',
  },
  emptyText: {
    color: '#A6ADC8',
    fontSize: 12,
    fontStyle: 'italic',
  },
  header: {
    color: '#CDD6F4',
    fontWeight: 'bold',
    fontSize: 13,
    marginBottom: 8,
  },
  logCard: {
    backgroundColor: '#1E1E2E',
    borderRadius: 6,
    padding: 8,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#89B4FA',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  taskTitle: {
    color: '#F5E0DC',
    fontSize: 12,
    fontWeight: '600',
  },
  timeText: {
    color: '#A6ADC8',
    fontSize: 10,
  },
  actionType: {
    color: '#BAC2DE',
    fontSize: 11,
  },
  bold: {
    fontWeight: 'bold',
  },
  details: {
    color: '#A6ADC8',
    fontSize: 11,
    marginTop: 2,
  },
  errorText: {
    color: '#F38BA8',
    fontSize: 10,
    marginTop: 2,
  },
});
