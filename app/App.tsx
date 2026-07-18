/**
 * Aurelia — Android-only audio companion (Phase 1 MVP UI).
 * Basic settings only: connection status, tap-to-talk, quiet mode, relationships, Phase 0 spike.
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import {fetchCheckInPrompt, healthCheck} from './src/api/client';
import {
  loadRelationships,
  removeRelationship,
  setRelationship,
  type RelationshipsMap,
} from './src/automation/relationships';
import {BluetoothSession} from './src/bluetooth/BluetoothSession';
import {CONFIG} from './src/config';
import {requestAllRuntimePermissions} from './src/permissions';
import {CheckInScheduler} from './src/scheduler/CheckInScheduler';
import {
  detectLocalCommand,
  onEarbudsDisconnected,
  runTapToTalkTurn,
  speakCheckIn,
} from './src/voice/conversationLoop';
import {Speech} from './src/voice/Speech';

type LogLine = {ts: number; text: string};

function App(): React.JSX.Element {
  const [btConnected, setBtConnected] = useState(false);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [status, setStatus] = useState('Starting…');
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [reply, setReply] = useState('');
  const [quietMode, setQuietMode] = useState(false);
  const [intervalMin, setIntervalMin] = useState(60);
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [relationships, setRelationships] = useState<RelationshipsMap>({});
  const [aliasInput, setAliasInput] = useState('wife');
  const [contactInput, setContactInput] = useState('');
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [phase0Running, setPhase0Running] = useState(false);
  const [batterySamples, setBatterySamples] = useState<string[]>([]);
  const quietRef = useRef(false);

  const log = useCallback((text: string) => {
    setLogs(prev => [{ts: Date.now(), text}, ...prev].slice(0, 80));
  }, []);

  useEffect(() => {
    quietRef.current = quietMode;
  }, [quietMode]);

  // Bootstrap
  useEffect(() => {
    let cancelled = false;
    const subs: Array<{remove: () => void}> = [];

    (async () => {
      setStatus('Requesting permissions…');
      const perms = await requestAllRuntimePermissions();
      log(`Permissions: ${JSON.stringify(perms)}`);

      const quiet = await CheckInScheduler.getQuietMode();
      const intervalMs = await CheckInScheduler.getIntervalMs();
      const rel = await loadRelationships();
      if (cancelled) return;
      setQuietMode(quiet);
      setIntervalMin(Math.round(intervalMs / 60000));
      setRelationships(rel);

      try {
        const h = await healthCheck();
        if (!cancelled) {
          setBackendOk(!!h.has_api_key);
          log(`Backend ok model=${h.model} key=${h.has_api_key}`);
        }
      } catch (e: any) {
        if (!cancelled) {
          setBackendOk(false);
          log(`Backend unreachable: ${e?.message || e}`);
        }
      }

      try {
        await BluetoothSession.startListening();
        const connected = await BluetoothSession.isConnected();
        const name = await BluetoothSession.getConnectedDeviceName();
        if (!cancelled) {
          setBtConnected(connected);
          setDeviceName(name);
          setStatus(connected ? 'Earbuds connected' : 'Waiting for earbuds…');
        }
        if (connected && !quiet) {
          await CheckInScheduler.start();
          log('Scheduler started (earbuds already connected)');
        }
      } catch (e: any) {
        log(`BT start error: ${e?.message || e}`);
        setStatus('Bluetooth module error');
      }

      subs.push(
        BluetoothSession.onConnected(async payload => {
          setBtConnected(true);
          setDeviceName(payload.deviceName ?? null);
          setStatus('Earbuds connected');
          log(`BT connected: ${payload.deviceName || 'device'}`);
          if (!quietRef.current) {
            await CheckInScheduler.start();
          }
          try {
            await Speech.speak("I'm here.");
          } catch {
            // optional soft greeting
          }
        }),
      );
      subs.push(
        BluetoothSession.onDisconnected(async payload => {
          setBtConnected(false);
          setDeviceName(null);
          setStatus('Earbuds disconnected — session cleared');
          log(`BT disconnected: ${payload.deviceName || ''}`);
          await CheckInScheduler.stop();
          await onEarbudsDisconnected();
        }),
      );
      subs.push(
        CheckInScheduler.onProactiveCheckIn(async p => {
          log(`Check-in fired phase0=${!!p.phase0}`);
          if (quietRef.current && !p.phase0) {
            log('Suppressed (quiet mode)');
            return;
          }
          const prompt = p.phase0
            ? 'Phase zero probe. I am still alive in the background.'
            : await fetchCheckInPrompt();
          try {
            await speakCheckIn(prompt);
            setReply(prompt);
            setStatus(p.phase0 ? 'Phase 0 probe spoken' : 'Check-in spoken');
          } catch (e: any) {
            log(`Check-in speak failed: ${e?.message || e}`);
          }
        }),
      );
      subs.push(
        CheckInScheduler.onPhase0Battery(p => {
          const line = `${new Date().toISOString()} ${p.event} battery=${p.batteryPct}%`;
          setBatterySamples(prev => [line, ...prev].slice(0, 40));
          log(line);
        }),
      );
    })();

    return () => {
      cancelled = true;
      subs.forEach(s => s.remove());
      BluetoothSession.stopListening().catch(() => {});
    };
  }, [log]);

  const onTapToTalk = async () => {
    if (listening) {
      await Speech.stopListening();
      setListening(false);
      setStatus('Cancelled');
      return;
    }
    setListening(true);
    setTranscript('');
    setReply('');
    await runTapToTalkTurn({
      isQuietMode: () => quietRef.current,
      onStatus: s => setStatus(s),
      onTranscript: t => {
        setTranscript(t);
        log(`You: ${t}`);
        const cmd = detectLocalCommand(t);
        if (cmd === 'quiet_on') {
          void toggleQuiet(true);
        } else if (cmd === 'quiet_off') {
          void toggleQuiet(false);
        }
      },
      onReply: r => {
        setReply(r);
        log(`Aurelia: ${r}`);
      },
      onAction: (action, msg) => log(`Action ${action.type}: ${msg}`),
      onLatencyMs: ms => {
        setLastLatencyMs(ms);
        log(`Latency end-of-speech→TTS: ${ms}ms`);
      },
      onError: err => log(`Error: ${err}`),
    });
    setListening(false);
  };

  const toggleQuiet = async (value: boolean) => {
    setQuietMode(value);
    quietRef.current = value;
    await CheckInScheduler.setQuietMode(value);
    log(`Quiet mode ${value ? 'ON' : 'OFF'}`);
    if (value) {
      setStatus('Quiet mode on');
    } else if (btConnected) {
      await CheckInScheduler.start();
      setStatus('Quiet mode off — scheduler active');
    }
  };

  const applyInterval = async () => {
    const ms = Math.min(
      CONFIG.maxCheckInIntervalMs,
      Math.max(CONFIG.minCheckInIntervalMs, intervalMin * 60 * 1000),
    );
    setIntervalMin(Math.round(ms / 60000));
    await CheckInScheduler.setIntervalMs(ms);
    log(`Check-in interval set to ${Math.round(ms / 60000)} min`);
    if (btConnected && !quietMode) {
      await CheckInScheduler.start();
    }
  };

  const saveRel = async () => {
    if (!aliasInput.trim() || !contactInput.trim()) {
      return;
    }
    const map = await setRelationship(aliasInput, contactInput);
    setRelationships({...map});
    setContactInput('');
    log(`Relationship saved: ${aliasInput} → contact`);
  };

  const deleteRel = async (alias: string) => {
    const map = await removeRelationship(alias);
    setRelationships({...map});
    log(`Removed relationship: ${alias}`);
  };

  const startPhase0 = async () => {
    setPhase0Running(true);
    await CheckInScheduler.start({
      phase0: true,
      intervalMs: CONFIG.phase0ProbeIntervalMs,
    });
    log('Phase 0 spike started (10 min probes + battery log)');
    setStatus('Phase 0 running — leave app backgrounded ≥30 min');
  };

  const stopPhase0 = async () => {
    setPhase0Running(false);
    await CheckInScheduler.stop();
    if (btConnected && !quietMode) {
      await CheckInScheduler.start();
    }
    log('Phase 0 stopped');
  };

  const dumpPhase0Log = async () => {
    const battery = await CheckInScheduler.getPhase0BatteryLog();
    const latency = await Speech.getLatencyLog();
    log('--- phase0_battery.log ---');
    battery.split('\n').filter(Boolean).slice(-10).forEach(l => log(l));
    log('--- latency.log ---');
    latency.split('\n').filter(Boolean).slice(-10).forEach(l => log(l));
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0B1020" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Aurelia</Text>
        <Text style={styles.subtitle}>Audio companion · Android MVP</Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <View
              style={[
                styles.dot,
                {backgroundColor: btConnected ? '#3DDC97' : '#F45B69'},
              ]}
            />
            <Text style={styles.cardTitle}>
              {btConnected ? 'Earbuds connected' : 'Earbuds disconnected'}
            </Text>
          </View>
          {deviceName ? <Text style={styles.muted}>{deviceName}</Text> : null}
          <Text style={styles.muted}>Status: {status}</Text>
          <Text style={styles.muted}>
            Brain:{' '}
            {backendOk === null
              ? 'checking…'
              : backendOk
                ? 'reachable + API key'
                : 'unreachable or missing key'}
          </Text>
          {lastLatencyMs != null ? (
            <Text style={styles.muted}>
              Last latency: {lastLatencyMs} ms{' '}
              {lastLatencyMs < 2000 ? '(under 2s target)' : '(over 2s target)'}
            </Text>
          ) : null}
        </View>

        <Pressable
          style={[styles.talkButton, listening && styles.talkButtonActive]}
          onPress={onTapToTalk}
          disabled={false}>
          {listening ? (
            <ActivityIndicator color="#0B1020" />
          ) : (
            <Text style={styles.talkLabel}>Hold space · Tap to talk</Text>
          )}
          <Text style={styles.talkHint}>
            {listening ? 'Tap again to cancel' : 'Mic off until you tap'}
          </Text>
        </Pressable>

        {transcript ? (
          <View style={styles.card}>
            <Text style={styles.label}>You</Text>
            <Text style={styles.body}>{transcript}</Text>
          </View>
        ) : null}
        {reply ? (
          <View style={styles.card}>
            <Text style={styles.label}>Aurelia</Text>
            <Text style={styles.body}>{reply}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>Quiet mode</Text>
            <Switch
              value={quietMode}
              onValueChange={toggleQuiet}
              trackColor={{false: '#333', true: '#5B8CFF'}}
            />
          </View>
          <Text style={styles.muted}>
            Suppresses proactive check-ins. Also: say “quiet mode” or “not now”.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Check-in interval (45–90 min)</Text>
          <View style={styles.row}>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={String(intervalMin)}
              onChangeText={t => setIntervalMin(Number(t.replace(/[^\d]/g, '')) || 0)}
            />
            <Text style={styles.muted}>minutes</Text>
            <Pressable style={styles.smallBtn} onPress={applyInterval}>
              <Text style={styles.smallBtnText}>Apply</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Relationships</Text>
          <Text style={styles.muted}>
            Alias → phone (E.164) or email. Used for “text my wife…”.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="alias (wife)"
            placeholderTextColor="#667"
            value={aliasInput}
            onChangeText={setAliasInput}
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="+15551234567 or name@email.com"
            placeholderTextColor="#667"
            value={contactInput}
            onChangeText={setContactInput}
            autoCapitalize="none"
          />
          <Pressable style={styles.smallBtn} onPress={saveRel}>
            <Text style={styles.smallBtnText}>Save relationship</Text>
          </Pressable>
          {Object.entries(relationships).map(([k, v]) => (
            <View key={k} style={styles.relRow}>
              <Text style={styles.body}>
                {k}: {v}
              </Text>
              <Pressable onPress={() => deleteRel(k)}>
                <Text style={styles.danger}>Remove</Text>
              </Pressable>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Phase 0 technical spike</Text>
          <Text style={styles.muted}>
            Proves BT + foreground service survival + unprompted speech. Target ≥30
            min backgrounded. Probes every 10 min; battery logged natively.
          </Text>
          <View style={styles.row}>
            {!phase0Running ? (
              <Pressable style={styles.smallBtn} onPress={startPhase0}>
                <Text style={styles.smallBtnText}>Start Phase 0</Text>
              </Pressable>
            ) : (
              <Pressable style={[styles.smallBtn, styles.dangerBtn]} onPress={stopPhase0}>
                <Text style={styles.smallBtnText}>Stop Phase 0</Text>
              </Pressable>
            )}
            <Pressable style={styles.smallBtn} onPress={dumpPhase0Log}>
              <Text style={styles.smallBtnText}>Dump logs</Text>
            </Pressable>
          </View>
          {batterySamples.slice(0, 5).map(s => (
            <Text key={s} style={styles.logLine}>
              {s}
            </Text>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Activity log</Text>
          {logs.map(l => (
            <Text key={`${l.ts}-${l.text}`} style={styles.logLine}>
              {new Date(l.ts).toLocaleTimeString()} · {l.text}
            </Text>
          ))}
        </View>

        <Text style={styles.footer}>
          Tier 1 only · API keys stay on the FastAPI backend · No Tier 2 accessibility
          automation in this build
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#0B1020'},
  scroll: {padding: 20, paddingBottom: 48},
  title: {
    color: '#F4F7FF',
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  subtitle: {color: '#8B93A7', marginBottom: 16, marginTop: 4},
  card: {
    backgroundColor: '#151B2E',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#243049',
  },
  cardTitle: {color: '#F4F7FF', fontSize: 16, fontWeight: '600'},
  label: {color: '#5B8CFF', fontSize: 12, fontWeight: '700', marginBottom: 4},
  body: {color: '#E8ECF8', fontSize: 15, lineHeight: 21},
  muted: {color: '#8B93A7', fontSize: 13, marginTop: 4},
  row: {flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap'},
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dot: {width: 10, height: 10, borderRadius: 5},
  talkButton: {
    backgroundColor: '#5B8CFF',
    borderRadius: 20,
    paddingVertical: 28,
    alignItems: 'center',
    marginBottom: 12,
  },
  talkButtonActive: {backgroundColor: '#3DDC97'},
  talkLabel: {color: '#0B1020', fontSize: 18, fontWeight: '700'},
  talkHint: {color: '#0B1020', opacity: 0.7, marginTop: 6, fontSize: 12},
  input: {
    backgroundColor: '#0B1020',
    borderWidth: 1,
    borderColor: '#243049',
    borderRadius: 10,
    color: '#F4F7FF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
    minWidth: 80,
    flexGrow: 1,
  },
  smallBtn: {
    backgroundColor: '#243049',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 8,
    marginRight: 8,
  },
  dangerBtn: {backgroundColor: '#5A2030'},
  smallBtnText: {color: '#F4F7FF', fontWeight: '600'},
  relRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    alignItems: 'center',
  },
  danger: {color: '#F45B69'},
  logLine: {color: '#6E7890', fontSize: 11, marginTop: 4, fontFamily: 'monospace'},
  footer: {color: '#4A5268', fontSize: 11, textAlign: 'center', marginTop: 8},
});

export default App;
