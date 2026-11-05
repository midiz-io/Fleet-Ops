// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleSupabaseError(error: any, context?: string): never {
  console.error(`Supabase error [${context || 'Unknown context'}]:`, error);

  // Handle unique constraint violations (Postgres Error Code: 23505)
  if (error?.code === '23505') {
    const message = error.message || '';
    const details = error.details || '';
    const fullError = `${message} ${details}`.toLowerCase();

    if (fullError.includes('drivers_phone_key')) {
      throw new Error("A driver with this phone number already exists.");
    }
    if (fullError.includes('vehicles_vehicle_no_key')) {
      throw new Error("A vehicle with this registration number already exists.");
    }
    if (fullError.includes('checklists_driver_id_vehicle_id_date_key') || fullError.includes('checklists')) {
      throw new Error("A checklist for this vehicle has already been submitted today.");
    }
    
    throw new Error("This entry already exists.");
  }

  // Handle Supabase bandwidth quota exceeded (HTTP 402) / restricted project
  const rawMsg = (error?.message || '').toLowerCase();
  const rawDetails = (error?.details || '').toLowerCase();
  if (
    error?.status === 402 ||
    error?.code === '402' ||
    rawMsg.includes('exceed_egress_quota') ||
    rawMsg.includes('egress') ||
    rawMsg.includes('spend caps') ||
    rawMsg.includes('quota') ||
    rawMsg.includes('restricted') ||
    rawDetails.includes('exceed_egress_quota')
  ) {
    throw new Error(
      "Supabase Database Bandwidth Exceeded (Quota 402): Service is restricted. Please upgrade your plan or remove spend caps in Supabase Dashboard."
    );
  }

  // Handle network / connection errors
  if (error?.message === 'Failed to fetch' || error?.code === 'PGRST000') {
    throw new Error("Network error. Please check your internet connection.");
  }

  // Specific error message from database / Supabase
  if (error?.message) {
    throw new Error(error.message);
  }

  // Generic fallback user-friendly message
  throw new Error(`Failed to ${context || 'perform operation'}. Please try again.`);
}
