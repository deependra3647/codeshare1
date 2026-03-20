import React,{useRef, useState, useEffect} from "react";
import toast from "react-hot-toast";
import ACTIONS from "../Actions";
import Client from "../components/Client";
import Editor from "../components/Editor";
import { initSocket } from "../socket";
import {useLocation, useNavigate, Navigate,useParams} from "react-router-dom";

const EditorPage=()=>{  
  const socketRef=useRef(null);
  const codeRef=useRef(null);
  const location=useLocation();
  const reactNavigator = useNavigate();
  const {roomId}=useParams();

  const [clients,setClients]=useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [canWrite, setCanWrite] = useState(true);
  const [isPending, setIsPending] = useState(false);
  const [joinRequests, setJoinRequests] = useState([]);

  useEffect(() =>{
    const init = async () => {
      socketRef.current = await initSocket();
      socketRef.current.on('connect_error',(err)=>handleErrors(err));
      socketRef.current.on('connect_failed',(err)=>handleErrors(err));

      function handleErrors(e){
        console.log("socket error",e);
        toast.error("Socket connection failed, try again later.");
        reactNavigator('/'); 
      }

      // Mark as pending before emitting — server will clear it via JOINED or REJECTED
      setIsPending(true);
      socketRef.current.emit(ACTIONS.JOIN,{
        roomId,
        username: location.state?.username,
      });

      socketRef.current.on(
        ACTIONS.JOINED,
        ({ clients, username, socketId, isAdmin: adminStatus, canWrite: writePermission, code }) => {
          if (username !== location.state?.username){
            toast.success(`${username} joined the room.`);
          }
          setClients(clients);

          if (socketId === socketRef.current.id) {
            setIsPending(false);
            if (adminStatus !== undefined) setIsAdmin(adminStatus);
            if (writePermission !== undefined) setCanWrite(writePermission);
            if (code !== null && code !== undefined) codeRef.current = code;
            if (codeRef.current) {
              socketRef.current.emit(ACTIONS.SYNC_CODE, { code: codeRef.current, socketId });
            }
          }

          const currentClient = clients.find(c => c.socketId === socketRef.current.id);
          if (currentClient && currentClient.canWrite !== undefined) setCanWrite(currentClient.canWrite);
        }
      );

      socketRef.current.on(
        ACTIONS.DISCONNECTED,
        ({ socketId, username, clients: updatedClients }) => {
          toast.success(`${username} left the room.`);
          if (updatedClients) {
            setClients(updatedClients);
            const me = updatedClients.find(c => c.socketId === socketRef.current.id);
            if (me && me.isAdmin) setIsAdmin(true);
          } else {
            setClients(prev => prev.filter(c => c.socketId !== socketId));
          }
        }
      );

      socketRef.current.on(ACTIONS.USER_KICKED, ({ message }) => {
        toast.error(message || 'You have been kicked from the room.');
        reactNavigator('/');
      });

      socketRef.current.on(ACTIONS.PERMISSION_DENIED, ({ message }) => {
        toast.error(message || 'You do not have permission to write.');
      });

      socketRef.current.on(ACTIONS.PERMISSION_UPDATED, ({ canWrite: writePermission }) => {
        if (writePermission !== undefined) {
          setCanWrite(writePermission);
          writePermission ? toast.success('Write permission granted by admin.') : toast.error('Write permission revoked by admin.');
        }
      });

      socketRef.current.on(ACTIONS.CLIENTS_UPDATED, ({ clients: updatedClients }) => {
        if (updatedClients) {
          setClients(updatedClients);
          const me = updatedClients.find(c => c.socketId === socketRef.current.id);
          if (me && me.canWrite !== undefined) setCanWrite(me.canWrite);
        }
      });

      // Admin receives join request
      socketRef.current.on(ACTIONS.JOIN_REQUEST, ({ socketId, username }) => {
        setJoinRequests(prev => [...prev, { socketId, username }]);
      });

      // We got approved — pending screen clears, JOINED event will load the editor
      socketRef.current.on(ACTIONS.JOIN_APPROVED, () => {
        setIsPending(false);
      });

      // We got rejected — go back home
      socketRef.current.on(ACTIONS.JOIN_REJECTED, ({ message }) => {
        toast.error(message || 'Your join request was denied.');
        reactNavigator('/');
      });
    };

    init();

    return () => {
      socketRef.current.off(ACTIONS.JOINED);
      socketRef.current.off(ACTIONS.DISCONNECTED);
      socketRef.current.off(ACTIONS.USER_KICKED);
      socketRef.current.off(ACTIONS.PERMISSION_DENIED);
      socketRef.current.off(ACTIONS.PERMISSION_UPDATED);
      socketRef.current.off(ACTIONS.CLIENTS_UPDATED);
      socketRef.current.off(ACTIONS.JOIN_REQUEST);
      socketRef.current.off(ACTIONS.JOIN_APPROVED);
      socketRef.current.off(ACTIONS.JOIN_REJECTED);
      socketRef.current.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function copyRoomId(){
    try{
      await navigator.clipboard.writeText(roomId);
      toast.success("Room ID has been copied to your clipboard");
    } catch (err) {
      toast.error("Failed to copy Room ID");
    }
  }

  async function logDownload(code) {
    try {
      const apiBase = process.env.REACT_APP_API_URL || window.location.origin;
      await fetch(new URL('/api/downloads', apiBase).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, username: location.state?.username || 'unknown', code }),
      });
    } catch (err) {
      console.error('Failed to log download', err);
    }
  }

  async function downloadCode(){
    const code = codeRef.current || '';
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'codeshare.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    await logDownload(code);
    toast.success("Code downloaded successfully");
  }

  function leaveRoom(){
    reactNavigator('/');
  }

  function handleKickUser(targetSocketId) {
    if (isAdmin && socketRef.current) {
      socketRef.current.emit(ACTIONS.KICK_USER, { roomId, targetSocketId });
    }
  }

  function handleToggleWrite(targetSocketId) {
    if (isAdmin && socketRef.current) {
      socketRef.current.emit(ACTIONS.TOGGLE_WRITE, { roomId, targetSocketId });
    }
  }

  function handleApproveJoin(targetSocketId) {
    if (isAdmin && socketRef.current) {
      socketRef.current.emit(ACTIONS.APPROVE_JOIN, { roomId, targetSocketId });
      setJoinRequests(prev => prev.filter(r => r.socketId !== targetSocketId));
    }
  }

  function handleRejectJoin(targetSocketId) {
    if (isAdmin && socketRef.current) {
      socketRef.current.emit(ACTIONS.REJECT_JOIN, { roomId, targetSocketId });
      setJoinRequests(prev => prev.filter(r => r.socketId !== targetSocketId));
    }
  }

  if(!location.state){
    return <Navigate to="/"/>;
  }

  // Waiting for admin approval
  if (isPending) {
    return (
      <div className="pendingWrap">
        <div className="pendingCard">
          <img className="logoImage" src="/code-sync.png" alt="logo" />
          <h2>Waiting for Approval</h2>
          <p>Your request has been sent to the admin. Please wait...</p>
          <div className="pendingSpinner"></div>
          <button className="btn leaveBtn" style={{marginTop:'24px'}} onClick={leaveRoom}>Cancel</button>
        </div>
      </div>
    );
  }

  return( 
  <div className="mainWrap">

    {/* Admin join-request notification cards — top right */}
    {isAdmin && joinRequests.length > 0 && (
      <div className="joinRequestsContainer">
        {joinRequests.map((req) => (
          <div key={req.socketId} className="joinRequestCard">
            <span className="joinRequestText">
              <strong>{req.username}</strong> wants to join the room
            </span>
            <div className="joinRequestActions">
              <button className="joinRequestBtn confirmBtn" onClick={() => handleApproveJoin(req.socketId)}>
                Confirm
              </button>
              <button className="joinRequestBtn cancelBtn" onClick={() => handleRejectJoin(req.socketId)}>
                Cancel
              </button>
            </div>
          </div>
        ))}
      </div>
    )}

    <div className="aside">
      <div className="asideInner">
        <div className="logo">
          <img className="logoImage" src="/code-sync.png" alt="logo" />
        </div>
        <h3>Connected</h3>
        <div className="clientsList">
          {clients.map((client)=>(
            <Client 
              key={client.socketId} 
              username={client.username}
              socketId={client.socketId}
              isAdmin={isAdmin && client.socketId !== socketRef.current?.id}
              clientIsAdmin={client.isAdmin}
              canWrite={client.canWrite}
              onKick={handleKickUser}
              onToggleWrite={handleToggleWrite}
            />
          ))}
        </div>
      </div>
      <button className="btn downloadBtn" onClick={downloadCode}>Download</button>
      <button className="btn copyBtn" onClick={copyRoomId}>Copy ROOM ID</button>
      <button className="btn leaveBtn" onClick={leaveRoom}>Leave</button>
    </div>
    <div className="editorwrap">
      <Editor socketRef={socketRef} roomId={roomId} canWrite={canWrite} onCodeChange={(code) => { codeRef.current = code; }} />
    </div>
  </div>
  );
}
export default EditorPage;
