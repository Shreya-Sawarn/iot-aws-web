'use client';

import { useCommandStore } from '@/store/commandStore';
import type { CommandType } from '@/types';
import { useAuthStore } from '@/store/authStore';

/**
 * Command submission hook.
 * Phase-2: replace submitCommand body with AppSync mutation.
 */
export function useCommand(device_id: string) {
  const { submitCommand, getCommandsByDevice, getActiveCommand, getCommandAcks, isSubmitting, error } = useCommandStore();
  const { session } = useAuthStore();

  const commands = getCommandsByDevice(device_id);
  const activeCommand = getActiveCommand(device_id);

  async function send(
    command_type: CommandType,
    extras?: { target_position_pct?: number; tenant_id: string; site_id: string }
  ) {
    if (!session?.user || !extras) return;
    return submitCommand({
      tenant_id: extras.tenant_id,
      site_id: extras.site_id,
      device_id,
      command_type,
      issued_by: session.user.user_id,
      target_position_pct: extras.target_position_pct,
    });
  }

  return { send, commands, activeCommand, getCommandAcks, isSubmitting, error };
}
