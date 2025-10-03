import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props){ super(props); this.state = { hasError:false, err:null }; }
  static getDerivedStateFromError(err){ return { hasError:true, err }; }
  componentDidCatch(err, info){ console.error("ErrorBoundary caught:", err, info); }
  render(){
    if(!this.state.hasError) return this.props.children;
    return (
      <div style={{padding:"2rem", fontFamily:"ui-sans-serif"}}>
        <h1 style={{fontSize:20, fontWeight:600, marginBottom:8}}>Something went wrong.</h1>
        <p style={{color:"#6b7280"}}>Check the console for details.</p>
      </div>
    );
  }
}
