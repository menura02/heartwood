import { interpolate } from '../src/locale.ts';
import type { Language } from '../src/locale.ts';

const en = {
  ready: 'Synapse is ready at {origin}',
  registrationToken: 'Registration token (valid for 30 minutes) {token}',
  stop: 'Press Ctrl+C to stop the lab.',
};

type MessageKey = keyof typeof en;

const tr: Record<MessageKey, string> = {
  ready: 'Synapse hazır {origin}',
  registrationToken: '30 dakikalık kayıt belirteci {token}',
  stop: 'Laboratuvarı kapatmak için Ctrl+C tuşlarına bas.',
};

export const labCatalog = {en, tr};

export function labMessage(language: Language, key: MessageKey, fields?: Record<string, string>): string {
  return interpolate(labCatalog[language]?.[key] || en[key], fields);
}
