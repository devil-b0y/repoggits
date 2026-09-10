'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { MessageCircle, Reply } from 'lucide-react';
import { Notice, send, useSession } from './shared';

export type Comment={id:string;body:string;parent_id:string|null;created_at:string;name:string};
export default function Discussion({projectId,comments,onComment,published}:{projectId:string;comments:Comment[];onComment:(comment:Comment)=>void;published:boolean}) {
  const {user,emailVerificationRequired}=useSession();
  const [replyTo,setReplyTo]=useState<Comment|null>(null),[body,setBody]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function post(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError('');try{const result=await send<{comment:Comment}>(`projects/${projectId}/comments`,{body,parentId:replyTo?.id});onComment(result.comment);setBody('');setReplyTo(null);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  const allowed=user&&(!emailVerificationRequired||user.verified);
  function chooseReply(comment:Comment){setReplyTo(comment);document.getElementById('discussion-message')?.focus();}
  function commentView(comment:Comment){return <><div className="comment-author"><strong>{comment.name}</strong><time dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleDateString()}</time></div><p>{comment.body}</p>{allowed&&published&&<button className="text-button" onClick={()=>chooseReply(comment)}><Reply size={15}/> Reply to {comment.name}</button>}</>;}
  return <section className="detail-section discussion" id="discussion"><h2><MessageCircle size={23}/> Project discussion</h2><p>Ask a question, share an improvement, or help the next team.</p>
    {error&&<Notice error>{error}</Notice>}
    {published?(allowed?<form onSubmit={post}>{replyTo&&<div className="reply-context">Replying to {replyTo.name}<button type="button" className="text-button" onClick={()=>setReplyTo(null)}>Cancel reply</button></div>}<label htmlFor="discussion-message">{replyTo?'Your reply':'Start a discussion'}</label><textarea id="discussion-message" rows={3} required minLength={2} maxLength={2000} value={body} onChange={e=>setBody(e.target.value)}/><button className="button blue" disabled={busy}>{busy?'Posting…':replyTo?'Post reply':'Post question'}</button></form>:<p><Link className="inline-link" href="/auth">{emailVerificationRequired?'Sign in with a verified account':'Sign in'}</Link> to join the conversation.</p>):<p>Discussion opens when this project is approved.</p>}
    {comments.filter(c=>!c.parent_id).reverse().map(root=><article className="discussion-thread" key={root.id}><div className="comment">{commentView(root)}</div>{comments.filter(c=>c.parent_id===root.id).map(reply=><div className="comment thread-reply" key={reply.id}>{commentView(reply)}</div>)}</article>)}
    {!comments.length&&<p>No discussions yet. Bring the first question.</p>}
  </section>;
}
