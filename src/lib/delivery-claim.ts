import { addDaysKey, dayBounds, localDate } from "./dates";
import { prisma } from './db';

// Only these local checks establish that no provider request was sent.
export function deliveryFailureStatus(error?: string): 'failed' | 'unknown' {
  return ['SMTP is not configured; no email was sent.', 'TELEGRAM_BOT_TOKEN not configured', 'Telegram chat is not configured'].includes(error || '')
    ? 'failed' : 'unknown';
}
export async function reconcileStaleDeliveries(now = new Date()) {
  const cutoff = new Date(now.getTime() - 20 * 60000);
  return prisma.reminderDelivery.updateMany({where:{status:'pending',OR:[
    {lastAttemptAt:{lt:cutoff}}, {lastAttemptAt:null,createdAt:{lt:cutoff}},
  ]},data:{status:'unknown',error:'Delivery outcome unknown after interrupted attempt; review provider receipts before retrying.'}});
}
export async function claimDelivery(userId:string,day:string,channel:string,now=new Date()) {
  const created=await prisma.reminderDelivery.createMany({data:[{userId,day,channel,status:'pending',attempts:1,lastAttemptAt:now}],skipDuplicates:true});
  if(created.count) return true;
  const previous=await prisma.reminderDelivery.findUnique({where:{userId_day_channel:{userId,day,channel}}});
  if(!previous || previous.status !== 'failed') return false;
  if(deliveryFailureStatus(previous.error || undefined)==='unknown') {
    await prisma.reminderDelivery.updateMany({where:{id:previous.id,status:'failed'},data:{status:'unknown'}});
    return false;
  }
  if(previous.attempts>=5) return false;
  const due=(previous.lastAttemptAt?.getTime() || previous.createdAt.getTime()) + Math.min(3600000,60000*2**previous.attempts);
  if(now.getTime()<due) return false;
  const claim=await prisma.reminderDelivery.updateMany({where:{id:previous.id,status:'failed',attempts:previous.attempts},
    data:{status:'pending',attempts:{increment:1},lastAttemptAt:now,error:null}});
  return claim.count===1;
}

// reminderHour remains a digest preference (AM today / PM tomorrow).
// Lead time moves the send instant, never the identity of the target day.
export function reminderSchedule(timezone: string, hour: number, leadMinutes: number, now = new Date()) {
  const today = dayBounds(timezone, now).key;
  const lead = Math.max(0, Math.min(360, leadMinutes || 0));
  let selected: { claimDay: string; workoutDay: string; sendAt: Date } | null = null;
  for (const anchor of [today, addDaysKey(today, 1)]) {
    const scheduled = localDate(anchor, timezone, `${String(hour).padStart(2, "0")}:00`);
    const sendAt = new Date(scheduled.getTime() - lead * 60000);
    if (sendAt <= now) selected = { claimDay: anchor,
      workoutDay: hour >= 12 ? addDaysKey(anchor, 1) : anchor, sendAt };
  }
  return selected;
}
