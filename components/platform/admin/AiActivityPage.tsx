'use client';
import dynamic from 'next/dynamic';
import { AdminPage } from './AdminFrame';
// Fetched only when this page opens.
const AiActivity=dynamic(()=>import('../AiActivity'));
export default function AiActivityPage(){
 return <AdminPage section="aiActivity" title="AI activity" description="Every prompt sent to the project assistant, newest first, with per-person access controls. Only Super Admins can open this page.">
  <AiActivity/>
 </AdminPage>;
}
