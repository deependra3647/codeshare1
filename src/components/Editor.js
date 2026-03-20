/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useRef } from 'react';
import Codemirror from 'codemirror';
import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/dracula.css';
import 'codemirror/mode/javascript/javascript';
import 'codemirror/addon/edit/closetag';
import 'codemirror/addon/edit/closebrackets';
import ACTIONS from '../Actions';

const Editor = ({socketRef, roomId, canWrite = true, onCodeChange}) => {
  const editorRef = useRef(null);

  useEffect(() =>{
    async function init(){
      editorRef.current = Codemirror.fromTextArea(
        document.getElementById("realtimeEditor"),
        {
          mode: {name: "javascript", json: true},
          theme: 'dracula',
          autoCloseTags: true,
          autoCloseBrackets: true,
          lineNumbers: true,
          readOnly: !canWrite,
        }
      );

      editorRef.current.on('change',(instance, changes)=>{
        const {origin} = changes;
        const code = instance.getValue();
        onCodeChange(code);
        if(origin !== 'setValue' && socketRef.current && canWrite){
          socketRef.current.emit(ACTIONS.CODE_CHANGE,{ roomId, code });
        }
      });
    }
    init();
  },[]);

  useEffect(() => {
    if(editorRef.current) {
      editorRef.current.setOption('readOnly', !canWrite);
    }
  }, [canWrite]);

  useEffect(() =>{
    const socket = socketRef.current;
    if(!socket) return;

    const handleCodeChange = ({code}) => {
      if(editorRef.current && code !== null && code !== undefined){
        if(editorRef.current.getValue() !== code){
          editorRef.current.setValue(code);
        }
      }
    };

    socket.on(ACTIONS.CODE_CHANGE, handleCodeChange);
    return () => socket.off(ACTIONS.CODE_CHANGE, handleCodeChange);
  },[]);

  return (
    <textarea id="realtimeEditor"></textarea>
  );
}
export default Editor;
