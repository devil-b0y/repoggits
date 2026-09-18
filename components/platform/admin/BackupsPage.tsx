'use client';
import dynamic from 'next/dynamic';
import { AdminPage } from './AdminFrame';
// Fetched only when this page opens.
const Backup=dynamic(()=>import('../Backup'));
export default function BackupsPage(){
 return <AdminPage section="backups" title="Backups" description="Download a ZIP of the website source, pages, public media, tests and setup files.">
  <Backup/>
 </AdminPage>;
}
