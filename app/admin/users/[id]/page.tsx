import UserDetailPage from '@/components/platform/admin/UserDetailPage';
// params is a Promise in this Next.js version; the id is passed on to the client page, which validates it through the API.
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <UserDetailPage id={id}/>;}
