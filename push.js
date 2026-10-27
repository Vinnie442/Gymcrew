import {VAPID_PUBLIC_KEY} from './push-config.js';

export function pushAvailable() {
  return window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function registration() {
  await navigator.serviceWorker.register('./sw.js');
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => setTimeout(() => reject(Error('Le service de notifications ne démarre pas. Ferme puis rouvre l’application.')), 15000))
  ]);
}

export async function savePush(api, group, settings) {
  if (!pushAvailable()) throw Error('Les notifications push ne sont pas disponibles dans ce navigateur.');
  if (!group || group === 'local') throw Error('Rejoins ton groupe avant d’activer les notifications.');
  if (!/^[A-Za-z0-9_-]{87}$/.test(VAPID_PUBLIC_KEY)) throw Error('Les notifications ne sont pas encore configurées sur le serveur.');
  // Cette fonction est appelée uniquement depuis un clic explicite.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw Error('Autorise les notifications dans les réglages du navigateur pour recevoir les rappels.');
  return upsertSubscription(api, group, settings);
}

// Au démarrage, sans clic : renvoie l'abonnement actuel au serveur. Chrome peut renouveler
// l'abonnement ; sans ce renvoi, le serveur garde l'ancien, qui expire, et plus rien n'arrive.
export async function refreshPush(api, group, settings) {
  if (!pushAvailable() || Notification.permission !== 'granted') return;
  if (!group || group === 'local' || !/^[A-Za-z0-9_-]{87}$/.test(VAPID_PUBLIC_KEY)) return;
  if (!settings.enabled && !settings.friday) return;
  await upsertSubscription(api, group, settings);
}

async function upsertSubscription(api, group, settings) {
  const reg = await registration();
  const key = Uint8Array.from(atob(VAPID_PUBLIC_KEY.replace(/-/g,'+').replace(/_/g,'/')+'='), c=>c.charCodeAt(0));
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
  const data = sub.toJSON();
  const path = 'gym_push_subscriptions?endpoint=eq.'+encodeURIComponent(data.endpoint);
  const rows = await api(path+'&select=id');
  const body = {group_id:group,keys:data.keys,creatine_enabled:settings.enabled,creatine_time:settings.time,friday_enabled:settings.friday};
  if (rows.length) await api(path,'PATCH',body);
  else await api('gym_push_subscriptions','POST',{...body,endpoint:data.endpoint});
  return sub;
}

export async function disablePush(api) {
  if (!pushAvailable()) return;
  const reg = await registration();
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    // Supprimer côté serveur d’abord pour que l’arrêt soit effectif même si unsubscribe échoue.
    await api('gym_push_subscriptions?endpoint=eq.'+encodeURIComponent(sub.endpoint),'DELETE');
    await sub.unsubscribe();
  }
}
