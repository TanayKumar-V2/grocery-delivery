"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [message, setMessage] = useState("Connecting to backend...");

  useEffect(() => {
    async function checkBackend() {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/health`,
        );

        const data = await response.text();

        setMessage(`Backend says: ${data}`);
      } catch (error) {
        console.error(error);
        setMessage("Could not connect to backend");
      }
    }

    checkBackend();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <h1 className="text-2xl font-bold">{message}</h1>
    </main>
  );
}
