export class HttpError extends Error {
  constructor(public status:number, message:string) { super(message); }
}
export function requireCondition(condition:unknown, status:number, message:string): asserts condition {
  if (!condition) throw new HttpError(status, message);
}
