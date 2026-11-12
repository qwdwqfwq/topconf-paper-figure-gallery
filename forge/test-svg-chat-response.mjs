import {test} from 'node:test';
import assert from 'node:assert/strict';
import {svgChatResponse} from './svg-chat-response.mjs';
const parseXML=()=>({querySelector:()=>null,documentElement:{localName:'svg'}});
const response=(content,finish_reason='stop')=>({choices:[{message:{content},finish_reason}]});
test('HTTP 200 error envelope is surfaced with attempts and request ID',()=>{
 assert.throws(()=>svgChatResponse({error:{message:'Incomplete NoneLinear stream',code:'incomplete_stream',attempts:3,request_id:'req_test'}},{parseXML,chinese:true}),e=>e.code==='upstream_error'&&/模型服务返回错误/.test(e.message)&&/attempts=3/.test(e.message)&&/req_test/.test(e.message));
});
test('empty, length, null finish and truncated output cannot enter rendering or audit',()=>{
 for(const value of [response(''),response('<svg/>','length'),response('<svg></svg>',null),response('<svg><g>')])assert.throws(()=>svgChatResponse(value,{parseXML}));
});
test('complete SVG is extracted unchanged and validated as XML',()=>{
 let received;const svg='<svg xmlns="http://www.w3.org/2000/svg"><text>你好</text></svg>';
 assert.deepEqual(svgChatResponse(response('Here is the figure: '+svg+' end'),{parseXML:s=>{received=s;return parseXML();}}),{code:svg,truncated:false,completed:false});assert.equal(received,svg);
});
test('complete closing tag does not hide malformed nested XML',()=>{
 assert.throws(()=>svgChatResponse(response('<svg><g></svg>'),{parseXML:()=>({querySelector:()=>({}),documentElement:{localName:'svg'}})}),e=>e.code==='invalid_svg');
});
test('compatible JSON providers without finish_reason retain structural validation',()=>{
 assert.equal(svgChatResponse({choices:[{message:{content:'<svg></svg>'}}]},{parseXML}).code,'<svg></svg>');
});

test('model decorative XML comments are removed without changing SVG geometry or text',()=>{
 const source='<svg><!-- ---- INPUTS ---- --><text>A &amp; B</text><path d="M0 0L1 1"/></svg>';
 assert.equal(svgChatResponse(response(source),{parseXML}).code,'<svg><text>A &amp; B</text><path d="M0 0L1 1"/></svg>');
});
