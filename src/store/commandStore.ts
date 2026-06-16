// ============================================================
// COMMAND STORE — Full ACK lifecycle management
// NO FALSE SUCCESS — only 'completed' ack_stage = success
// Future: swap for AppSync mutation -> Lambda -> IoT Core
// ============================================================

import { create } from 'zustand';
import type { Command, CommandAck, CommandType, AckStage, ReasonCode, FaultCode } from '@/types';
import { MOCK_COMMANDS } from '@/mock-data/seed';
import { getSimulator } from '@/simulator/lteSimulator';

let commandSeq = 1000;
function generateCommandId(): string {
  return `CMD-${Date.now()}-${++commandSeq}`;
}
function generateAckId(): string {
  return `ACK-${Date.now()}-${commandSeq}`;
}

interface CommandState {
  commands: Command[];
  commandAcks: Record<string, CommandAck[]>;
  activeCommandsByDevice: Record<string, string>;
  isSubmitting: boolean;
  error: string | null;

  initialize: () => void;
  submitCommand: (params: {
    tenant_id: string;
    site_id: string;
    device_id: string;
    command_type: CommandType;
    issued_by: string;
    target_position_pct?: number;
  }) => Promise<string>;
  updateCommandAckStage: (
    command_id: string,
    stage: AckStage,
    extras?: Partial<Pick<Command, 'reason_code' | 'fault_code' | 'final_position_pct' | 'execution_duration_ms' | 'completed_at' | 'result'>>
  ) => void;
  getCommandsByDevice: (device_id: string) => Command[];
  getActiveCommand: (device_id: string) => Command | undefined;
  getCommandAcks: (command_id: string) => CommandAck[];
  clearError: () => void;
}

export const useCommandStore = create<CommandState>()((set, get) => ({
  commands: [],
  commandAcks: {},
  activeCommandsByDevice: {},
  isSubmitting: false,
  error: null,

  initialize: () => {
    set({ commands: MOCK_COMMANDS });
  },

  submitCommand: async (params) => {
    const { tenant_id, site_id, device_id, command_type, issued_by, target_position_pct } = params;

    set({ isSubmitting: true, error: null });

    const command_id = generateCommandId();
    const now = new Date().toISOString();
    const expires_at = new Date(Date.now() + 60000).toISOString();

    const command: Command = {
      command_id,
      tenant_id,
      site_id,
      device_id,
      command_type,
      command_payload: target_position_pct !== undefined ? { target_position_pct } : undefined,
      issued_by,
      issued_at: now,
      expires_at,
      current_ack_stage: 'command_requested',
      result: 'pending',
      created_at: now,
      updated_at: now,
    };

    // Create initial ack
    const initialAck: CommandAck = {
      ack_id: generateAckId(),
      command_id,
      device_id,
      tenant_id,
      site_id,
      ack_stage: 'command_requested',
      result: 'pending',
      ts_device: now,
      ts_cloud: now,
    };

    set(state => ({
      commands: [command, ...state.commands],
      commandAcks: { ...state.commandAcks, [command_id]: [initialAck] },
      activeCommandsByDevice: { ...state.activeCommandsByDevice, [device_id]: command_id },
      isSubmitting: false,
    }));

    // Pass to LTE simulator for full ACK lifecycle
    const simulator = getSimulator();

    // Listen for ACK updates from simulator
    const unsubscribe = simulator.subscribe((event) => {
      if (event.type !== 'ack' || !event.payload) return;
      const ack = event.payload as import('@/types').AckPayload;
      if (ack.command_id !== command_id) return;

      const newAck: CommandAck = {
        ack_id: generateAckId(),
        command_id,
        device_id,
        tenant_id,
        site_id,
        ack_stage: ack.ack_stage,
        result: ack.result,
        reason_code: ack.reason_code,
        fault_code: ack.fault_code,
        current_state: ack.current_state,
        final_position_pct: ack.final_position_pct,
        execution_duration_ms: ack.execution_duration_ms,
        ts_device: ack.ts_device,
        ts_cloud: new Date().toISOString(),
      };

      const isTerminal = ['completed', 'failed', 'rejected', 'blocked', 'timeout', 'safety_stopped'].includes(ack.ack_stage);

      get().updateCommandAckStage(command_id, ack.ack_stage, {
        reason_code: ack.reason_code,
        fault_code: ack.fault_code,
        final_position_pct: ack.final_position_pct,
        execution_duration_ms: ack.execution_duration_ms,
        result: ack.result,
        completed_at: isTerminal ? new Date().toISOString() : undefined,
      });

      set(state => ({
        commandAcks: {
          ...state.commandAcks,
          [command_id]: [...(state.commandAcks[command_id] ?? []), newAck],
        },
        activeCommandsByDevice: isTerminal
          ? Object.fromEntries(Object.entries(state.activeCommandsByDevice).filter(([k]) => k !== device_id))
          : state.activeCommandsByDevice,
      }));

      if (isTerminal) unsubscribe();
    });

    // Send to simulator
    await simulator.processCommand({
      schema: 'orbipulse.command.v1',
      schema_version: 1,
      msg_type: 'command',
      tenant_id,
      site_id,
      device_id,
      command_id,
      command_type,
      command_payload: target_position_pct !== undefined ? { target_position_pct } : undefined,
      issued_by,
      issued_at: now,
      expires_at,
    });

    return command_id;
  },

  updateCommandAckStage: (command_id, stage, extras) => {
    set(state => ({
      commands: state.commands.map(cmd =>
        cmd.command_id === command_id
          ? { ...cmd, current_ack_stage: stage, ...extras, updated_at: new Date().toISOString() }
          : cmd
      ),
    }));
  },

  getCommandsByDevice: (device_id: string) =>
    get().commands.filter(c => c.device_id === device_id).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ),

  getActiveCommand: (device_id: string) => {
    const { commands, activeCommandsByDevice } = get();
    const activeId = activeCommandsByDevice[device_id];
    if (!activeId) return undefined;
    return commands.find(c => c.command_id === activeId);
  },

  getCommandAcks: (command_id: string) => get().commandAcks[command_id] ?? [],

  clearError: () => set({ error: null }),
}));
