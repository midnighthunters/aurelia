/**
 * WebSocket client for low-latency streaming of screen frames and conversation turns.
 */

import {CONFIG} from '../config';
import {ActionPayload, getClientTimezone, clientNowIso} from './client';
import {ScreenCapture} from '../automation/ScreenCapture';
import {loadRelationships} from '../automation/relationships';
import {getOrCreateSessionId, getHistory} from '../memory/sessionMemory';

class StreamClient {
  private ws: WebSocket | null = null;
  private isCapturing = false;
  private screenSub: {remove: () => void} | null = null;

  async startStream(
    onReply: (replyText: string, action: ActionPayload) => void,
    onError?: (err: string) => void,
  ): Promise<void> {
    this.stopStream();

    const base = CONFIG.backendBaseUrl.replace(/^http/, 'ws').replace(/\/$/, '');
    const wsUrl = `${base}/stream`;
    
    try {
      this.ws = new WebSocket(wsUrl);
    } catch (e: any) {
      onError?.(`WS connection failed: ${e.message}`);
      return;
    }

    this.ws.onopen = () => {
      this.isCapturing = true;
      ScreenCapture.startCapture().catch(e => {
        onError?.(`Screen capture start error: ${e.message}`);
      });
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'reply') {
          onReply(msg.reply_text, msg.action);
        } else if (msg.type === 'error') {
          onError?.(msg.message);
        }
      } catch (e: any) {
        onError?.(`WS message error: ${e.message}`);
      }
    };

    this.ws.onerror = (e: any) => {
      onError?.(`WebSocket error: ${e.message || 'Unknown network error'}`);
    };

    this.ws.onclose = () => {
      this.cleanup();
    };

    // Stream screen capture frames to the websocket
    this.screenSub = ScreenCapture.onScreenFrame(payload => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(
            JSON.stringify({
              type: 'screen',
              data: payload.frame,
              timestamp: payload.timestamp,
            }),
          );
        } catch (e) {
          // Silent catch to prevent crash on closing socket
        }
      }
    });
  }

  async sendSpeechTurn(transcript: string, quietMode: boolean): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket stream not connected');
    }
    const sessionId = await getOrCreateSessionId();
    const history = await getHistory();
    const relationships = await loadRelationships();

    this.ws.send(
      JSON.stringify({
        type: 'turn',
        transcript,
        session_id: sessionId,
        history,
        client_now_iso: clientNowIso(),
        client_timezone: getClientTimezone(),
        quiet_mode: quietMode,
        relationships,
      }),
    );
  }

  stopStream(): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.cleanup();
  }

  private cleanup(): void {
    if (this.screenSub) {
      this.screenSub.remove();
      this.screenSub = null;
    }
    if (this.isCapturing) {
      ScreenCapture.stopCapture().catch(() => {});
      this.isCapturing = false;
    }
  }
}

export const streamClient = new StreamClient();
