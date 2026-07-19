'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useOwnerContext } from '@/lib/ownerContext';
import { loadGymConversations, loadConversation, sendMessage, markConversationRead } from '../../../../lib/supabase';
import { notifyUser } from '../../../../lib/notify';

const cls = 'flex-1 px-3.5 py-2.5 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none';

export default function OwnerMessagesPage() {
  return (
    <Suspense fallback={<div className="text-center text-gray-400 py-20">Loading...</div>}>
      <OwnerMessagesPageInner />
    </Suspense>
  );
}

function OwnerMessagesPageInner() {
  const { owner } = useOwnerContext();
  const searchParams = useSearchParams();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [thread, setThread] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const openConversation = async (convo) => {
    setSelected(convo);
    const rows = await loadConversation(owner.id, convo.userId);
    setThread(rows);
    await markConversationRead(owner.id, convo.userId, 'owner');
    setConversations((prev) => prev.map((c) => (c.userId === convo.userId ? { ...c, unreadCount: 0 } : c)));
  };

  useEffect(() => {
    (async () => {
      const convos = await loadGymConversations(owner.id);
      setConversations(convos);
      setLoading(false);

      // Deep-link from elsewhere in the owner portal (e.g. the "Message"
      // link next to an at-risk membership on the Analytics page).
      const targetUserId = searchParams.get('userId');
      if (targetUserId) {
        const existing = convos.find((c) => c.userId === targetUserId);
        openConversation(existing || { userId: targetUserId, username: searchParams.get('username') || null });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner.id]);

  const reply = async (e) => {
    e.preventDefault();
    if (!text.trim() || !selected) return;
    setSending(true);
    try {
      const msg = await sendMessage(owner.id, selected.userId, selected.username, 'owner', text.trim());
      setThread((prev) => [...prev, msg]);
      setText('');
      notifyUser(selected.userId, `Message from ${owner.gymName}`, msg.text);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-4xl font-black mb-2">Messages</h1>
        <p className="text-gray-600 dark:text-gray-400">Questions from members browsing or visiting your gym.</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-5">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-3 sm:col-span-1 max-h-[28rem] overflow-y-auto">
          {loading ? (
            <p className="text-sm text-gray-400 italic p-3">Loading...</p>
          ) : conversations.length === 0 ? (
            <p className="text-sm text-gray-400 italic p-3">No messages yet.</p>
          ) : (
            <ul className="space-y-1">
              {conversations.map((c) => (
                <li key={c.userId}>
                  <button
                    onClick={() => openConversation(c)}
                    className={
                      'w-full text-left px-3 py-2.5 rounded-lg transition ' +
                      (selected?.userId === c.userId ? 'bg-brand text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-800')
                    }
                  >
                    <div className="flex justify-between items-center gap-2">
                      <span className="font-semibold text-sm truncate">@{c.username || c.lastMessage?.username || 'member'}</span>
                      {c.unreadCount > 0 && (
                        <span className={'text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ' + (selected?.userId === c.userId ? 'bg-white text-brand' : 'bg-brand text-white')}>
                          {c.unreadCount}
                        </span>
                      )}
                    </div>
                    <div className={'text-xs truncate mt-0.5 ' + (selected?.userId === c.userId ? 'text-white/80' : 'text-gray-500 dark:text-gray-400')}>
                      {c.lastMessage?.text}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 sm:col-span-2 flex flex-col">
          {!selected ? (
            <p className="text-sm text-gray-400 italic m-auto">Select a conversation to view it.</p>
          ) : (
            <>
              <h2 className="font-bold text-sm text-gray-900 dark:text-gray-100 mb-3">@{selected.username || selected.lastMessage?.username}</h2>
              <ul className="space-y-2 mb-3 flex-1 max-h-72 overflow-y-auto">
                {thread.map((m) => (
                  <li key={m.id} className={'text-sm px-3 py-2 rounded-lg max-w-[85%] ' + (m.senderRole === 'owner' ? 'bg-brand/10 text-gray-900 dark:text-gray-100 ml-auto' : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100')}>
                    {m.text}
                  </li>
                ))}
              </ul>
              <form onSubmit={reply} className="flex gap-2">
                <input className={cls} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a reply..." autoFocus />
                <button type="submit" disabled={sending || !text.trim()} className="bg-brand hover:bg-brand-dark text-white text-sm font-semibold px-4 rounded-lg transition disabled:opacity-60">
                  Send
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
