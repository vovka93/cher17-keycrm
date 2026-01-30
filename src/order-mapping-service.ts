import redis from "./redis";
import { REDIS_KEYS } from "./config";
import type { SiteOrder, OrderMapping } from "./types";

export async function createOrUpdateOrderMapping(
  siteOrder: SiteOrder,
  status: OrderMapping['current_status'] = 'pending',
  crmResponse?: any
): Promise<void> {
  const rowid = siteOrder.externalOrderId;
  const now = Date.now();
  
  // Check if order mapping already exists
  const existingData = await redis.get(REDIS_KEYS.ORDER_MAPPING(rowid));
  
  if (existingData) {
    // Update existing order mapping
    const existing: OrderMapping = JSON.parse(existingData as string);
    
    // Add new status to history
    const statusEntry = {
      status,
      date: now,
      crm_response: crmResponse,
    };
    
    existing.status_history.push(statusEntry);
    existing.current_status = status;
    existing.updated_at = now;
    
    // Update CRM data if provided
    if (crmResponse) {
      if (siteOrder.orderStatus === 0) {
        existing.crm_pipeline_card = crmResponse;
      } else {
        existing.crm_order = crmResponse;
      }
    }
    
    const updatedData = JSON.stringify(existing);
    await redis.set(REDIS_KEYS.ORDER_MAPPING(rowid), updatedData);
    
    // Update history list (replace existing entry)
    await updateHistoryList(updatedData);
    
  } else {
    // Create new order mapping
    const newMapping: OrderMapping = {
      _rowid: rowid,
      site_order: siteOrder,
      status_history: [{
        status,
        date: now,
        crm_response: crmResponse,
      }],
      current_status: status,
      created_at: now,
      updated_at: now,
    };
    
    // Add CRM response if provided
    if (crmResponse) {
      if (siteOrder.orderStatus === 0) {
        newMapping.crm_pipeline_card = crmResponse;
      } else {
        newMapping.crm_order = crmResponse;
      }
    }
    
    const mappingData = JSON.stringify(newMapping);
    await redis.set(REDIS_KEYS.ORDER_MAPPING(rowid), mappingData);
    await redis.lpush(REDIS_KEYS.ORDER_HISTORY, mappingData);
    
    // Keep only last 1000 entries in history list
    await redis.ltrim(REDIS_KEYS.ORDER_HISTORY, 0, 999);
  }
}

export async function addStatusToHistory(
  rowid: string,
  status: OrderMapping['current_status'],
  crmResponse?: any,
  errorMessage?: string,
  retryCount?: number
): Promise<void> {
  const existing = await getOrderMapping(rowid);
  if (!existing) return;
  
  const statusEntry = {
    status,
    date: Date.now(),
    crm_response: crmResponse,
    error_message: errorMessage,
    retry_count: retryCount,
  };
  
  existing.status_history.push(statusEntry);
  existing.current_status = status;
  existing.updated_at = Date.now();
  
  // Update CRM data if provided
  if (crmResponse) {
    const siteOrder = existing.site_order;
    if (siteOrder.orderStatus === 0) {
      existing.crm_pipeline_card = crmResponse;
    } else {
      existing.crm_order = crmResponse;
    }
  }
  
  const updatedData = JSON.stringify(existing);
  await redis.set(REDIS_KEYS.ORDER_MAPPING(rowid), updatedData);
  await updateHistoryList(updatedData);
}

export async function getOrderMapping(rowid: string): Promise<OrderMapping | null> {
  const mappingData = await redis.get(REDIS_KEYS.ORDER_MAPPING(rowid));
  if (!mappingData) return null;
  
  return JSON.parse(mappingData as string);
}

export async function getOrderHistory(limit: number = 100): Promise<OrderMapping[]> {
  const historyCount = await redis.llen(REDIS_KEYS.ORDER_HISTORY);
  const items: OrderMapping[] = [];
  
  // Get unique order mappings by checking for duplicates and using latest
  const uniqueOrders = new Map<string, OrderMapping>();
  
  for (let i = 0; i < Math.min(historyCount, limit * 2); i++) {
    const item = await redis.lindex(REDIS_KEYS.ORDER_HISTORY, i);
    if (!item) continue;
    
    const mapping: OrderMapping = JSON.parse(item as string);
    const rowid = mapping._rowid || mapping.site_order?.externalOrderId;
    
    if (rowid) {
      uniqueOrders.set(rowid, mapping);
    }
  }
  
  // Convert to array and limit results
  return Array.from(uniqueOrders.values()).slice(0, limit);
}

export async function updateHistoryList(updatedData: string): Promise<void> {
  // Remove existing entry with same _rowid from history list
  const updated: OrderMapping = JSON.parse(updatedData);
  const rowid = updated._rowid;
  
  const historyCount = await redis.llen(REDIS_KEYS.ORDER_HISTORY);
  for (let i = 0; i < historyCount; i++) {
    const item = await redis.lindex(REDIS_KEYS.ORDER_HISTORY, i);
    if (!item) continue;
    
    const mapping: OrderMapping = JSON.parse(item as string);
    const existingRowid = mapping._rowid || mapping.site_order?.externalOrderId;
    
    if (existingRowid === rowid) {
      await redis.lrem(REDIS_KEYS.ORDER_HISTORY, 1, item);
      break;
    }
  }
  
  // Add updated entry to front of list
  await redis.lpush(REDIS_KEYS.ORDER_HISTORY, updatedData);
  await redis.ltrim(REDIS_KEYS.ORDER_HISTORY, 0, 999);
}

export async function getOrderMappingsByStatus(status: OrderMapping['current_status']): Promise<OrderMapping[]> {
  const history = await getOrderHistory(1000);
  return history.filter(mapping => mapping.current_status === status);
}

// Cleanup functions
export async function cleanHistory(options: {
  olderThan?: number;
  status?: OrderMapping['current_status'][];
  dryRun?: boolean;
}): Promise<{ toDelete: number; deleted: number; errors: string[] }> {
  const { olderThan, status, dryRun = false } = options;
  
  try {
    const history = await getOrderHistory(5000);
    let toDelete = 0;
    let deleted = 0;
    const errors: string[] = [];
    
    for (const mapping of history) {
      let shouldDelete = false;
      
      // Check age criteria
      if (olderThan && mapping.updated_at < olderThan) {
        shouldDelete = true;
      }
      
      // Check status criteria
      if (status && status.includes(mapping.current_status)) {
        shouldDelete = true;
      }
      
      if (shouldDelete) {
        toDelete++;
        
        if (!dryRun) {
          try {
            // Remove from history list
            const mappingData = JSON.stringify(mapping);
            await redis.lrem(REDIS_KEYS.ORDER_HISTORY, 1, mappingData);
            
            // Remove individual mapping
            const mappingKey = REDIS_KEYS.ORDER_MAPPING(mapping._rowid);
            await redis.del(mappingKey);
            
            deleted++;
          } catch (error) {
            errors.push(`Failed to delete ${mapping._rowid}: ${error}`);
          }
        }
      }
    }
    
    return { toDelete, deleted, errors };
  } catch (error) {
    return { toDelete: 0, deleted: 0, errors: [`Cleanup failed: ${error}`] };
  }
}

export async function getHistoryStats(): Promise<{
  total: number;
  byStatus: Record<string, number>;
  oldestRecord: number | null;
  newestRecord: number | null;
}> {
  const history = await getOrderHistory(5000);
  const byStatus: Record<string, number> = {};
  let oldestRecord = Date.now();
  let newestRecord = 0;
  
  history.forEach(mapping => {
    // Count by current status
    byStatus[mapping.current_status] = (byStatus[mapping.current_status] || 0) + 1;
    
    // Track oldest/newest
    if (mapping.created_at < oldestRecord) {
      oldestRecord = mapping.created_at;
    }
    if (mapping.created_at > newestRecord) {
      newestRecord = mapping.created_at;
    }
  });
  
  return {
    total: history.length,
    byStatus,
    oldestRecord: oldestRecord === Date.now() ? null : oldestRecord,
    newestRecord: newestRecord === 0 ? null : newestRecord
  };
}

// Legacy functions for backward compatibility
export async function saveOrderMapping(
  siteOrder: SiteOrder,
  status: OrderMapping['current_status'] = 'pending'
): Promise<void> {
  await createOrUpdateOrderMapping(siteOrder, status);
}

export async function updateOrderMapping(
  siteOrderId: string,
  updates: any
): Promise<void> {
  const status = updates.status || 'pending';
  const crmResponse = updates.crm_order || updates.crm_pipeline_card;
  await addStatusToHistory(siteOrderId, status, crmResponse);
}