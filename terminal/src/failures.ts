const en = {
  storePassphraseTooShort: 'The store passphrase must be at least 12 characters.',
  cryptoStoreMissing: 'This profile’s crypto store is missing. The same device identity cannot be recreated.',
  cryptoStoreOpenFailed: 'Could not open the crypto store. Check the passphrase and profile files.',
  unexpectedKeyRequest: 'Unexpected Matrix key request.',
  invalidSyncResponse: 'The server returned an invalid sync response.',
  peerBlocked: 'This user is blocked.',
  inviteNotVerified: 'No verifiable Heartwood invitation was found.',
  invitePeerChanged: 'The invited participant changed.',
  noPendingInvite: 'No pending invitation was found.',
  roomIdRequired: 'A full room ID is required.',
  noVerifiableDevice: 'No verifiable device was found for the account.',
  tooManyDevices: 'Multiple devices were found. This operation requires one device per account.',
  invalidDeviceKeys: 'The server did not return valid device keys.',
  deviceCodeMismatch: 'The device code did not match.',
  unencryptedKeyEvent: 'An unencrypted key event was blocked.',
  invalidMessageSize: 'The message must be 1–4000 UTF-8 bytes.',
  sendSessionChanged: 'The Matrix session for this send has changed.',
  chatPeerChanged: 'The other participant in the chat changed.',
  encryptionFailed: 'Encryption could not be completed.',
  invalidConversationSelection: 'Invalid selection. Use /conversations to open the list.',
  historyNotOpen: 'Open history first with /history !room.',
  noOlderEvents: 'There are no older events.',
  historyReadPending: 'A history request is already pending for this room.',
  invalidHistoryPage: 'The server did not return a valid history page.',
  historyCursorStalled: 'The history cursor did not advance.',
  liveReadPending: 'A live chat read is already in progress.',
  liveCursorStalled: 'The live chat cursor did not advance.',
  invalidMatrixOrigin: 'Use an HTTPS server address or an HTTP loopback address.',
  invalidPeerId: 'Enter the full user ID of another user on the same server.',
  invalidDeviceCode: 'Invalid device code. Enter exactly 64 hexadecimal digits or eight groups separated by single spaces.',
  deviceNotVerified: 'The other user’s device is unverified. Use /verify to verify the full device code.',
  trustedDeviceChanged: 'The verified device key changed. The operation stopped.',
  invalidRoomSettings: 'The room lacks the required private Heartwood and Megolm settings.',
  invalidRoomMembership: 'The room does not have the required two-person membership.',
  invalidKeyDistribution: 'Invalid key distribution.',
  keyTargetMismatch: 'The key distribution target does not match the verified device.',
  matrixRedirect: 'A Matrix redirect was rejected.',
  matrixInvalidJson: 'The server did not return valid JSON.',
  registrationFlowMissing: 'The server does not offer registration with a token.',
  registrationTokenRejected: 'The registration token could not be verified.',
  invalidLoginSession: 'The server did not return the expected session or device ID.',
  profileInUse: 'The profile is in use.',
  profileLockFailed: 'Could not determine whether the profile lock is safe.',
  profileNotFound: 'The local profile was not found.',
  profileUnsafePath: 'The local profile path or contents could not be verified.',
  profileLockUncertain: 'The profile has a legacy or unrecognized lock. Close all clients and inspect the lock.',
  invalidProfileOrUsername: 'Invalid profile name or username.',
  profileRecordMissing: 'The profile record is missing. Existing files have been kept.',
  profileBindingMismatch: 'This profile is bound to a different server or user.',
  sendInProgress: 'A send is already in progress.',
  noPendingSend: 'There is no pending send.',
  pendingSendChanged: 'The pending send changed.',
  pendingSendExists: 'This room has a pending send. Use /retry.',
  pendingSendLimit: 'The pending send limit has been reached.',
  labTokenMissing: 'Could not retrieve a registration token.',
  labPythonMissing: 'Set HEARTWOOD_SYNAPSE_PYTHON to the Python executable for Synapse 1.164.2.',
  labInvalidPort: 'Invalid lab port.',
  labStopUnconfirmed: 'Could not confirm that the lab process stopped.',
  labNotReady: 'Synapse did not become ready. Check the Python path and the 1.164.2 installation.',
  labExited: 'The Synapse lab shut down unexpectedly.',
  labAdminTokenMissing: 'HEARTWOOD_LAB_ADMIN_TOKEN is required.',
  labRequestFailed: 'The lab API rejected the request.',
  labTokenCreateFailed: 'Could not create a registration token.',
  labPortInUse: 'The lab port is in use.',
  demoPlatform: 'Run the demo from Linux or WSL with Linux Node.js.',
  demoArguments: 'Invalid demo arguments. Use node lab/demo.ts --help.',
  demoFailed: 'The demo did not finish. Check the local Synapse setup and run the terminal integration test for details.',
  invalidLanguage: 'Invalid language selection. Use --lang en or --lang tr, or set HEARTWOOD_LANG to en or tr.',
  matrixTransport: 'Could not connect to the server, or the request timed out.',
  matrixSessionExpired: 'The Matrix session is invalid or has expired. Sign in again.',
  matrixForbidden: 'The Matrix server denied permission for this operation.',
  matrixRateLimited: 'The Matrix server received too many requests. Try again later.',
  matrixNotFound: 'The requested resource was not found on the Matrix server.',
  matrixUsernameTaken: 'This username is already in use on the Matrix server.',
  matrixInvalidUsername: 'The Matrix server rejected this username.',
  matrixUnavailable: 'The Matrix server is temporarily unavailable.',
  matrixRequest: 'The Matrix request failed.',
  unexpected: 'An unexpected error occurred.',
};

export type FailureCode = keyof typeof en;

const tr: Record<FailureCode, string> = {
  storePassphraseTooShort: 'Depo parolası en az 12 karakter olmalı.',
  cryptoStoreMissing: 'Bu profilin kripto deposu eksik. Aynı cihaz kimliği yeniden oluşturulamaz.',
  cryptoStoreOpenFailed: 'Kripto deposu açılamadı. Parolayı ve profil dosyalarını kontrol edin.',
  unexpectedKeyRequest: 'Beklenmeyen Matrix anahtar isteği.',
  invalidSyncResponse: 'Geçersiz eşzamanlama yanıtı.',
  peerBlocked: 'Bu kullanıcı engelli.',
  inviteNotVerified: 'Doğrulanabilir Heartwood daveti bulunamadı.',
  invitePeerChanged: 'Davetin katılımcısı değişti.',
  noPendingInvite: 'Bekleyen davet bulunamadı.',
  roomIdRequired: 'Tam oda kimliği gerekli.',
  noVerifiableDevice: 'Hesap için doğrulanabilir bir cihaz bulunamadı.',
  tooManyDevices: 'Birden çok cihaz bulundu. İşlem için hesap başına tek cihaz gerekli.',
  invalidDeviceKeys: 'Sunucu geçerli cihaz anahtarları döndürmedi.',
  deviceCodeMismatch: 'Cihaz kodu eşleşmedi.',
  unencryptedKeyEvent: 'Şifrelenmemiş anahtar olayı engellendi.',
  invalidMessageSize: 'Mesaj 1–4000 UTF-8 bayt olmalı.',
  sendSessionChanged: 'Gönderimin Matrix oturumu değişti.',
  chatPeerChanged: 'Sohbetin karşı tarafı değişti.',
  encryptionFailed: 'Şifreleme tamamlanmadı.',
  invalidConversationSelection: 'Geçersiz seçim. /conversations ile listeyi aç.',
  historyNotOpen: 'Önce /history !oda ile geçmişi aç.',
  noOlderEvents: 'Daha eski olay yok.',
  historyReadPending: 'Bu oda için geçmiş isteği bekliyor.',
  invalidHistoryPage: 'Sunucu geçerli bir geçmiş sayfası döndürmedi.',
  historyCursorStalled: 'Geçmiş imleci ilerlemedi.',
  liveReadPending: 'Canlı sohbet okuması sürüyor.',
  liveCursorStalled: 'Canlı sohbet imleci ilerlemedi.',
  invalidMatrixOrigin: 'HTTPS veya geri döngü (loopback) HTTP sunucu adresi gerekli.',
  invalidPeerId: 'Aynı sunucudan farklı bir tam kullanıcı kimliği gerekli.',
  invalidDeviceCode: 'Cihaz kodu biçimi geçersiz. Tam 64 onaltılık hane veya tek boşluklu sekiz grup gir.',
  deviceNotVerified: 'Karşı tarafın cihazı doğrulanmadı. /verify ile tam cihaz kodunu doğrula.',
  trustedDeviceChanged: 'Doğrulanmış cihaz anahtarı değişti. İşlem durduruldu.',
  invalidRoomSettings: 'Beklenen özel Heartwood odası ve Megolm yapılandırması bulunamadı.',
  invalidRoomMembership: 'İki kişilik beklenen oda üyeliği sağlanmadı.',
  invalidKeyDistribution: 'Geçersiz anahtar dağıtımı.',
  keyTargetMismatch: 'Anahtar dağıtım hedefi doğrulanmış cihazla eşleşmiyor.',
  matrixRedirect: 'Matrix yönlendirmesi reddedildi.',
  matrixInvalidJson: 'Sunucu geçerli bir JSON yanıtı döndürmedi.',
  registrationFlowMissing: 'Sunucuda belirteçli kayıt akışı bulunamadı.',
  registrationTokenRejected: 'Kayıt belirteci doğrulanamadı.',
  invalidLoginSession: 'Sunucu beklenen oturum veya cihaz kimliğini döndürmedi.',
  profileInUse: 'Profil kullanımda.',
  profileLockFailed: 'Profil kilidinin güvenli durumu belirlenemedi.',
  profileNotFound: 'Yerel profil bulunamadı.',
  profileUnsafePath: 'Yerel profilin yolu veya içeriği doğrulanamadı.',
  profileLockUncertain: 'Profilde eski veya belirsiz bir kilit var. Tüm istemcileri kapatıp kilidi incele.',
  invalidProfileOrUsername: 'Profil veya kullanıcı adı geçersiz.',
  profileRecordMissing: 'Profil kaydı eksik. Mevcut dosyalar korunuyor.',
  profileBindingMismatch: 'Bu profil farklı bir sunucuya veya kullanıcıya bağlı.',
  sendInProgress: 'Gönderim işlemi sürüyor.',
  noPendingSend: 'Bekleyen gönderim yok.',
  pendingSendChanged: 'Bekleyen gönderim değişti.',
  pendingSendExists: 'Bu odada bekleyen gönderim var. /retry kullan.',
  pendingSendLimit: 'Bekleyen gönderim sınırına ulaşıldı.',
  labTokenMissing: 'Kayıt belirteci alınamadı.',
  labPythonMissing: 'HEARTWOOD_SYNAPSE_PYTHON ile Synapse 1.164.2 Python yolunu belirt.',
  labInvalidPort: 'Geçersiz laboratuvar portu.',
  labStopUnconfirmed: 'Laboratuvar sürecinin durduğu doğrulanamadı.',
  labNotReady: 'Synapse hazır olmadı. Python yolunu ve 1.164.2 kurulumunu kontrol et.',
  labExited: 'Synapse laboratuvarı beklenmedik biçimde kapandı.',
  labAdminTokenMissing: 'HEARTWOOD_LAB_ADMIN_TOKEN gerekli.',
  labRequestFailed: 'Laboratuvar API isteği reddedildi.',
  labTokenCreateFailed: 'Kayıt belirteci oluşturulamadı.',
  labPortInUse: 'Laboratuvar portu kullanımda.',
  demoPlatform: 'Demoyu Linux veya WSL içinden Linux Node.js ile çalıştır.',
  demoArguments: 'Demo argümanları geçersiz. node lab/demo.ts --help kullan.',
  demoFailed: 'Demo tamamlanamadı. Yerel Synapse kurulumunu kontrol et ve ayrıntılar için terminal entegrasyon testini çalıştır.',
  invalidLanguage: 'Geçersiz dil seçimi. --lang en veya --lang tr kullan ya da HEARTWOOD_LANG değerini en veya tr yap.',
  matrixTransport: 'Sunucu bağlantısı kurulamadı veya istek zaman aşımına uğradı.',
  matrixSessionExpired: 'Matrix oturumu geçersiz veya süresi dolmuş. Yeniden giriş yap.',
  matrixForbidden: 'Matrix sunucusu bu işleme izin vermedi.',
  matrixRateLimited: 'Matrix sunucusu çok fazla istek aldı. Bir süre sonra yeniden dene.',
  matrixNotFound: 'İstenen kaynak Matrix sunucusunda bulunamadı.',
  matrixUsernameTaken: 'Bu kullanıcı adı Matrix sunucusunda zaten kullanılıyor.',
  matrixInvalidUsername: 'Matrix sunucusu bu kullanıcı adını kabul etmedi.',
  matrixUnavailable: 'Matrix sunucusuna şu anda erişilemiyor.',
  matrixRequest: 'Matrix isteği başarısız oldu.',
  unexpected: 'Beklenmeyen bir hata oluştu.',
};

export const failureCatalog = {en, tr};

type Language = keyof typeof failureCatalog;

function message(code: FailureCode, language: Language): string {
  return failureCatalog[language]?.[code] || en[code];
}

export class HeartwoodError extends Error {
  readonly code: FailureCode;

  constructor(code: FailureCode) {
    super(en[code]);
    this.code = code;
  }
}

const matrixCodes = {
  M_FORBIDDEN: 'matrixForbidden',
  M_UNKNOWN_TOKEN: 'matrixSessionExpired',
  M_MISSING_TOKEN: 'matrixSessionExpired',
  M_LIMIT_EXCEEDED: 'matrixRateLimited',
  M_NOT_FOUND: 'matrixNotFound',
  M_USER_IN_USE: 'matrixUsernameTaken',
  M_INVALID_USERNAME: 'matrixInvalidUsername',
} satisfies Record<string, FailureCode>;

function matrixMessage(status: number, code: string, language: Language): string {
  if (Object.hasOwn(matrixCodes, code)) {
    return `${message(matrixCodes[code as keyof typeof matrixCodes], language)} [${code}]`;
  }
  const failure = [502, 503, 504].includes(status) ? 'matrixUnavailable' : 'matrixRequest';
  const http = Number.isInteger(status) && status >= 100 && status <= 599 ? ` HTTP ${status}` : '';
  return `${message(failure, language)} [HW_MATRIX_REQUEST${http}]`;
}

export class MatrixTransportFailure extends HeartwoodError {
  constructor() { super('matrixTransport'); }
}

export class MatrixFailure extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(matrixMessage(status, code, 'en'));
    this.status = status;
    this.code = code;
  }
}

export function formatError(error: unknown, language: Language): string {
  if (error instanceof HeartwoodError && Object.hasOwn(en, error.code)) return message(error.code, language);
  if (error instanceof MatrixFailure) return matrixMessage(error.status, error.code, language);
  return `${message('unexpected', language)} [HW_UNEXPECTED]`;
}
