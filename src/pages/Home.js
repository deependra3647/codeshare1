import React,{useState} from 'react';
import {v4 as uuidV4} from 'uuid';
import toast from 'react-hot-toast';
import {useNavigate} from 'react-router-dom';



const Home=()=>{
  const navigate=useNavigate();
  const [roomId,setRoomId]=useState("");
  const [username,setUsername]=useState("");

  const createNewRoom=(e)=>{
    e.preventDefault();
    const id=uuidV4();
    setRoomId(id);
    toast.success("Created a new room");
  }

  const joinRoom=()=>{
    if(!roomId || !username){
      toast.error("ROOM ID & username is required");
      return;
    }
    //Redirecting to editor page
    navigate(`/editor/${roomId}`,{
      state:{
        username,
      }
    });
  };
  const handleInputEnter=(e)=>{
    if(e.code==="Enter"){
      joinRoom();
    }
  };
  return <div className="homePageWrapper">
    {/* Animated Particles Background */}
    <div className="particles-bg">
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
      <div className="particle"></div>
    </div>

    <div className="formWrapper">
      <img src="/code-sync.png" alt="code-sync-logo" />
      <h4 className="mainLabel">Paste invitation ROOM ID</h4>
      <div className="inputGroup">
        
        <input type="text"
        className="inputBox"
        placeholder="ROOM ID" 
        value={roomId}
        onChange={(e)=>setRoomId(e.target.value)}
        onKeyUp={handleInputEnter}
        />

        <input type="text" 
        className="inputBox" 
        placeholder="USERNAME" 
        value={username}
        onChange={(e)=>setUsername(e.target.value)}
        onKeyUp={handleInputEnter}
        />

        <button className="btn joinBtn" onClick={joinRoom}>Join</button>
        <span className="createInfo">If you don't have an invite then create &nbsp;
          <button onClick={createNewRoom} className="createNewBtn">new room</button>
        </span>
      </div>
    </div>
    <footer>
      <h4>Built with 💛 &nbsp; by <a href="https://github.com/deependra3647/Code-Share">Deependra</a> </h4>
    </footer>
  </div>
}

export default Home;