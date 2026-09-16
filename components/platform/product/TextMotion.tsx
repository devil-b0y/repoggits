'use client';
import {Children,cloneElement,createElement,isValidElement,type ReactElement,type ReactNode} from 'react';
/** React owns every text node. Neutral tags avoid existing span/card selectors. */
export function TextRun({children,mask=false}:{children:ReactNode;mask?:boolean}){const text=createElement('pv-text',{'data-pv-text':''},children);return mask?createElement('pv-mask',{},text):text;}
export function textMotionTree(node:ReactNode,mask=false):ReactNode{
 if(typeof node==='string'||typeof node==='number')return String(node).trim()?<TextRun mask={mask}>{node}</TextRun>:node;
 if(Array.isArray(node)){
  const grouped:ReactNode[]=[];
  for(const child of node){const last=grouped[grouped.length-1];if((typeof child==='string'||typeof child==='number')&&(typeof last==='string'||typeof last==='number'))grouped[grouped.length-1]=String(last)+String(child);else grouped.push(child);}
  return Children.map(grouped,child=>textMotionTree(child,mask));
 }
 if(!isValidElement(node)||node.type===TextRun)return node;
 const element=node as ReactElement<{children?:ReactNode}>;
 if(typeof element.type==='string'&&['svg','style','script','canvas'].includes(element.type))return node;
 if(element.props.children===undefined)return node;
 return cloneElement(element,undefined,textMotionTree(element.props.children,mask||element.type==='h1'));
}
