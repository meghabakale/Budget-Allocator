import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "wouter";
import { useSocket } from "../context/SocketContext";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import Layout from "../components/Layout";
import StatusBadge from "../components/StatusBadge";
import { formatCurrency } from "../lib/currency";
import { Send, MessageSquare } from "lucide-react";
import { Link } from "wouter";

interface Message {
  _id: string;
  senderName: string;
  senderRole: string;
  message: string;
  createdAt: string;
}

interface Request {
  _id: string;
  departmentName: string;
  requestedAmount: number;
  status: string;
  priorityLevel: string;
  justification: string;
}

function RequestList({ requests, selectedId }: { requests: Request[]; selectedId?: string }) {
  return (
    <div className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
      <div className="p-4 border-b border-gray-800">
        <h3 className="text-sm font-medium text-white">Negotiations</h3>
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-gray-800">
        {requests.map((r) => (
          <Link key={r._id} href={`/negotiation/${r._id}`} className={`block p-4 hover:bg-gray-800 transition-colors ${selectedId === r._id ? "bg-gray-800 border-l-2 border-blue-500" : ""}`}>
            <p className="text-sm font-medium text-white">{r.departmentName}</p>
            <p className="text-xs text-gray-500 mt-0.5">{formatCurrency(r.requestedAmount)}</p>
            <div className="mt-1.5"><StatusBadge status={r.status} /></div>
          </Link>
        ))}
        {requests.length === 0 && (
          <p className="p-4 text-xs text-gray-500">No negotiations yet</p>
        )}
      </div>
    </div>
  );
}

export default function NegotiationPanel() {
  const params = useParams<{ id?: string }>();
  const requestId = params.id;
  const { user } = useAuth();
  const { socket } = useSocket();
  const [requests, setRequests] = useState<Request[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [request, setRequest] = useState<Request | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadRequests = useCallback(async () => {
    const r = await api.requests.list();
    setRequests(r as unknown as Request[]);
  }, []);

  const loadMessages = useCallback(async () => {
    if (!requestId) return;
    const [msgs, reqs] = await Promise.all([
      api.negotiation.getMessages(requestId),
      api.requests.list(),
    ]);
    setMessages(msgs as unknown as Message[]);
    const req = (reqs as unknown as Request[]).find((r) => r._id === requestId);
    setRequest(req || null);
    setRequests(reqs as unknown as Request[]);
  }, [requestId]);

  useEffect(() => {
    if (requestId) loadMessages();
    else loadRequests();
  }, [requestId, loadMessages, loadRequests]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!socket || !requestId) return;
    socket.emit("JOIN_REQUEST", requestId);
    socket.on("NEGOTIATION_MESSAGE", (msg: Message) => {
      setMessages((prev) => [...prev, msg]);
    });
    socket.on("REQUEST_STATUS_CHANGED", loadMessages);
    return () => {
      socket.emit("LEAVE_REQUEST", requestId);
      socket.off("NEGOTIATION_MESSAGE");
      socket.off("REQUEST_STATUS_CHANGED", loadMessages);
    };
  }, [socket, requestId, loadMessages]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !requestId) return;
    setSending(true);
    try {
      await api.negotiation.sendMessage({ requestId, message: text.trim() });
      setText("");
      loadMessages();
    } finally {
      setSending(false);
    }
  };

  return (
    <Layout>
      <div className="flex h-full">
        <RequestList requests={requests} selectedId={requestId} />

        <div className="flex-1 flex flex-col">
          {requestId && request ? (
            <>
              <div className="p-4 border-b border-gray-800 bg-gray-900 flex items-center gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-white">{request.departmentName}</h2>
                    <StatusBadge status={request.status} />
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {formatCurrency(request.requestedAmount)} requested — {request.justification}
                  </p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-gray-500">
                    <MessageSquare size={32} className="mb-2 opacity-30" />
                    <p className="text-sm">No messages yet. Start the negotiation.</p>
                  </div>
                )}
                {messages.map((msg) => {
                  const isMe = msg.senderName === user?.username;
                  return (
                    <div key={msg._id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-sm ${isMe ? "items-end" : "items-start"} flex flex-col gap-1`}>
                        {!isMe && (
                          <span className="text-xs text-gray-500 px-1">
                            {msg.senderName} <span className="text-gray-600">({msg.senderRole.replace(/_/g, " ")})</span>
                          </span>
                        )}
                        <div className={`px-4 py-2.5 rounded-2xl text-sm ${isMe ? "bg-blue-600 text-white rounded-br-sm" : "bg-gray-800 text-gray-100 rounded-bl-sm"}`}>
                          {msg.message}
                        </div>
                        <span className="text-xs text-gray-600 px-1">
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              <form onSubmit={send} className="p-4 border-t border-gray-800 flex gap-3">
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  disabled={!text.trim() || sending}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-4 py-2 rounded-xl transition-colors flex items-center gap-2"
                >
                  <Send size={16} />
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
              <MessageSquare size={48} className="mb-3 opacity-20" />
              <p className="text-sm">Select a request to start negotiating</p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
