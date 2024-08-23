
'use client'
import { Box, Stack, TextField, Button, Typography } from "@mui/material";
import React, { useState } from "react";
import { auth } from "./firebase";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "firebase/auth";

export default function Home() {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hello! I'm the Rate My Professor support assistant. How can I help you today" },
  ]);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState(null);
  const [isSignUp, setIsSignUp] = useState(false);

  const sendMessage = async () => {
    if (!user) return alert("Please log in first!");
    setMessage('');
    setMessages((messages) => [
      ...messages,
      { role: "user", content: message },
      { role: "assistant", content: '' }
    ]);

    const response = fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([...messages, { role: "user", content: message }]),
    }).then(async (res) => {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let result = '';
      return reader.read().then(function processText({ done, value }) {
        if (done) {
          return result;
        }
        const text = decoder.decode(value || new Uint8Array(), { stream: true });
        setMessages((messages) => {
          let lastMessage = messages[messages.length - 1];
          let otherMessages = messages.slice(0, messages.length - 1);
          return [...otherMessages, { ...lastMessage, content: lastMessage.content + text }];
        });
        return reader.read().then(processText);
      });
    });
  };

  const handleLogin = async () => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      setUser(userCredential.user);
    } catch (error) {
      let errorMessage = "The username or password was incorrect. Please try again.";
      
      if (error.code === "auth/user-not-found" || error.code === "auth/wrong-password") {
        errorMessage = "Incorrect username or password. Please try again.";
      } else if (error.code === "auth/invalid-email") {
        errorMessage = "Invalid email format. Please check your email.";
      }

      alert(errorMessage);
    }
  };

  const handleSignUp = async () => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      setUser(userCredential.user);
      setIsSignUp(false); // Switch to login after successful sign-up
    } catch (error) {
      alert(error.message);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setUser(null);
    } catch (error) {
      alert(error.message);
    }
  };

  return (
    <Box width={'100vw'} height={'100vh'} display={'flex'} flexDirection={'column'} justifyContent={'center'} alignItems={'center'}>
      {!user ? (
        <Stack direction={'column'} spacing={2} width={'300px'} p={2} border={'1px solid black'} borderRadius={2}>
          <Typography variant="h6">{isSignUp ? "Sign Up" : "Login"}</Typography>
          <TextField label="Email" value={email} onChange={(e) => setEmail(e.target.value)} fullWidth />
          <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} fullWidth />
          {isSignUp ? (
            <>
              <Button variant={'contained'} color={'primary'} onClick={handleSignUp}>Sign Up</Button>
              <Button variant="text" onClick={() => setIsSignUp(false)}>Already have an account? Log in</Button>
            </>
          ) : (
            <>
              <Button variant={'contained'} color={'primary'} onClick={handleLogin}>Login</Button>
              <Button variant="text" onClick={() => setIsSignUp(true)}>Don't have an account? Sign Up</Button>
            </>
          )}
        </Stack>
      ) : (
        <Stack direction={'column'} width={'500px'} height={'700px'} border={'1px solid black'} p={2} spacing={3}>
          <Stack direction={'row'} justifyContent={'space-between'} alignItems={'center'}>
            <Typography variant="h6">Welcome, {user.email}</Typography>
            <Button variant="outlined" color="secondary" onClick={handleSignOut}>Sign Out</Button>
          </Stack>
          <Stack direction={'column'} spacing={2} flexGrow={1} overflow={'auto'} maxHeight={'100%'}>
            {messages.map((message, index) => (
              <Box key={index} display={'flex'} justifyContent={message.role === 'assistant' ? 'flex-start' : 'flex-end'}>
                <Box
                  bgcolor={message.role === 'assistant' ? 'primary.main' : 'secondary.main'}
                  color={'white'}
                  p={3}
                  borderRadius={5}
                >
                  {message.content}
                </Box>
              </Box>
            ))}
          </Stack>
          <Stack direction={'row'} spacing={2}>
            <TextField value={message} onChange={(e) => setMessage(e.target.value)} fullWidth />
            <Button variant={'contained'} color={'primary'} onClick={sendMessage}>Send</Button>
          </Stack>
        </Stack>
      )}
    </Box>
  );
}
