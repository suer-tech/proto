import { Participant } from "@/components/ParticipantsManager";

const STORAGE_KEY = "permanent_participants";

/**
 * Сохраняет список постоянных участников в localStorage
 * Сохраняются только участники с type === "permanent"
 */
export function savePermanentParticipants(participants: Participant[]): void {
  try {
    console.log(`[permanentParticipants] ===== SAVE CALLED =====`);
    console.log(`[permanentParticipants] Input participants:`, participants);
    console.log(`[permanentParticipants] Input participants length:`, participants?.length);
    
    if (!participants || !Array.isArray(participants) || participants.length === 0) {
      console.warn(`[permanentParticipants] Invalid input, not saving`);
      return;
    }
    
    const permanentOnly = participants.filter(p => p && p.type === "permanent");
    console.log(`[permanentParticipants] Filtered permanent participants:`, permanentOnly);
    console.log(`[permanentParticipants] Permanent count: ${permanentOnly.length}`);
    
    if (permanentOnly.length === 0) {
      console.warn(`[permanentParticipants] No permanent participants to save`);
      return;
    }
    
    const dataToSave = JSON.stringify(permanentOnly);
    localStorage.setItem(STORAGE_KEY, dataToSave);
    
    // Проверяем, что данные действительно сохранились
    const verify = localStorage.getItem(STORAGE_KEY);
    console.log(`[permanentParticipants] ✓ Saved ${permanentOnly.length} permanent participants to localStorage`);
    console.log(`[permanentParticipants] ✓ Saved data:`, permanentOnly);
    console.log(`[permanentParticipants] ✓ Storage key: ${STORAGE_KEY}`);
    console.log(`[permanentParticipants] ✓ Verification: ${verify ? 'OK' : 'FAILED'}`);
    if (verify) {
      const parsed = JSON.parse(verify);
      console.log(`[permanentParticipants] ✓ Verified data:`, parsed);
      console.log(`[permanentParticipants] ✓ Verified count: ${parsed.length}`);
    }
  } catch (error) {
    console.error("[permanentParticipants] ✗ Failed to save permanent participants:", error);
    console.error("[permanentParticipants] Error details:", error instanceof Error ? error.stack : error);
  }
}

/**
 * Загружает список постоянных участников из localStorage
 * Возвращает пустой массив, если данных нет или произошла ошибка
 */
export function loadPermanentParticipants(): Participant[] {
  try {
    console.log(`[permanentParticipants] Loading from storage key: ${STORAGE_KEY}`);
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      console.log("[permanentParticipants] No stored permanent participants found");
      return [];
    }
    
    console.log(`[permanentParticipants] Raw stored data:`, stored);
    const participants = JSON.parse(stored) as Participant[];
    console.log(`[permanentParticipants] Parsed participants:`, participants);
    
    // Валидация данных
    if (!Array.isArray(participants)) {
      console.warn("[permanentParticipants] Stored data is not an array, clearing");
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }
    
    // Фильтруем только валидные участники с type === "permanent"
    const validParticipants = participants.filter(p => {
      const isValid = p && 
        typeof p === 'object' && 
        p.type === "permanent" &&
        p.name && 
        p.id;
      if (!isValid) {
        console.warn(`[permanentParticipants] Invalid participant filtered out:`, p);
      }
      return isValid;
    });
    
    console.log(`[permanentParticipants] Loaded ${validParticipants.length} valid permanent participants from localStorage`);
    console.log(`[permanentParticipants] Valid participants:`, validParticipants);
    return validParticipants;
  } catch (error) {
    console.error("[permanentParticipants] Failed to load permanent participants:", error);
    // Очищаем поврежденные данные
    localStorage.removeItem(STORAGE_KEY);
    return [];
  }
}

/**
 * Очищает сохраненных постоянных участников
 */
export function clearPermanentParticipants(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log("[permanentParticipants] Cleared permanent participants from localStorage");
  } catch (error) {
    console.error("[permanentParticipants] Failed to clear permanent participants:", error);
  }
}

