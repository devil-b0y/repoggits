import { HttpError } from '../errors';
import { json } from '../http';
import { hasPermission, requirePermission } from './permissions';
import { activityColumns, activityQuery, activityRow, exportLog, pagedResponse, showIpTo } from './activity-query';
import type { AdminContext } from './router';

// GET /api/admin/logs (Paged<ActivityRow>) and /api/admin/logs/export?format=csv|json: the global activity log.
export async function logsRoute(context:AdminContext):Promise<Response> {
  const {user,search,method,path}=context;
  // A user's own timeline (the user detail page) needs only the users permission.
  if(!(search.get('user')&&hasPermission(user,'users')))requirePermission(user,'activity');
  const sub=path.slice(1);
  if(method!=='GET'||sub.length>1||sub.length===1&&sub[0]!=='export')throw new HttpError(404,'Endpoint not found.');
  const showIp=showIpTo(context),query=await activityQuery(context,'activity');
  if(sub[0]==='export')return exportLog(context,'activity',query,row=>activityRow(row,showIp),activityColumns(showIp));
  return json(await pagedResponse(search,query,row=>activityRow(row,showIp)));
}
