import fs from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from '../stores.js';
import { callHq } from './transport.js';

const packetDir = () => path.join(storeDir('ageru'), 'kansou');
const receiptDir = () => path.join(storeDir('ageru'), 'receipts');
const ID = /^pkt_[a-z2-9]{26}$/;
const CHOICES = {
  about: new Set(['developer', 'founder', 'researcher', 'student', 'other']),
  using_ronin_for: new Set(['coding', 'research', 'writing', 'operations', 'other']),
  feedback_kind: new Set(['like', 'idea', 'problem', 'question', 'other']),
} as const;

export interface KansouBody {
  message?: string;
  about?: string[];
  using_ronin_for?: string[];
  feedback_kind?: string[];
  reply_contact?: string;
}

export interface KansouPacket {
  envelope_version: 1;
  kind: 'kansou';
  body_schema_version: 1;
  packet_id: string;
  body: KansouBody;
}

export interface KansouReceipt {
  receipt_id: string;
  packet_id: string;
  received_at: string;
}

const text = (value: unknown, max: number): string => typeof value === 'string' ? value.trim().slice(0, max) : '';
const selections = (value: unknown, allowed: Set<string>): string[] => Array.isArray(value)
  ? [...new Set(value.filter((item): item is string => typeof item === 'string' && allowed.has(item)))].slice(0, 8)
  : [];

export function buildKansou(packetId: unknown, value: unknown): KansouPacket {
  if (typeof packetId !== 'string' || !ID.test(packetId)) throw new Error('invalid feedback packet id');
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const body: KansouBody = {};
  const message = text(input.message, 2_000);
  const about = selections(input.about, CHOICES.about);
  const using = selections(input.using_ronin_for, CHOICES.using_ronin_for);
  const kind = selections(input.feedback_kind, CHOICES.feedback_kind);
  const contact = text(input.reply_contact, 320);
  if (message) body.message = message;
  if (about.length) body.about = about;
  if (using.length) body.using_ronin_for = using;
  if (kind.length) body.feedback_kind = kind;
  if (contact) body.reply_contact = contact;
  if (!Object.keys(body).length) throw new Error('feedback is empty');
  return { envelope_version: 1, kind: 'kansou', body_schema_version: 1, packet_id: packetId, body };
}

export async function sendKansou(packet: KansouPacket): Promise<{ receipt: KansouReceipt; alreadyStored: boolean }> {
  await fs.mkdir(packetDir(), { recursive: true });
  const file = path.join(packetDir(), `${packet.packet_id}.json`);
  const bytes = JSON.stringify(packet, null, 2) + '\n';
  try { await fs.writeFile(file, bytes, { flag: 'wx', mode: 0o600 }); }
  catch (error: any) {
    if (error?.code !== 'EEXIST' || await fs.readFile(file, 'utf8') !== bytes) throw error;
  }
  const response = await callHq<KansouReceipt>('POST', '/v1/ageru/kansou', { body: packet });
  if ((response.status !== 200 && response.status !== 201) || !response.body) {
    throw new Error(response.error?.message || 'Ronin HQ did not accept the feedback');
  }
  await fs.mkdir(receiptDir(), { recursive: true });
  await fs.writeFile(path.join(receiptDir(), `${packet.packet_id}.json`), JSON.stringify(response.body, null, 2) + '\n', { mode: 0o600 });
  return { receipt: response.body, alreadyStored: response.status === 200 };
}
