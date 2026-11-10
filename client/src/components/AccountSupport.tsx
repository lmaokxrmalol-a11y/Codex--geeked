import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, LogOut, MessageCircle, UserRound, X } from "lucide-react";
import { trpc } from "../lib/trpc";
import { formatPrice } from "../lib/currency";
import {
  PAYMENT_METHOD_LABELS,
  type CheckoutPaymentMethod,
} from "../../../shared/payments";

type Channel = "system" | "books";

export default function AccountSupport({
  openRequest = 0,
}: {
  openRequest?: number;
}) {
  const [open, setOpen] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<
    number | null
  >(null);
  const [error, setError] = useState("");
  const utils = trpc.useUtils();
  const me = trpc.auth.me.useQuery();
  const role = me.data?.role;
  const conversations = trpc.support.list.useQuery(undefined, {
    enabled: Boolean(me.data),
  });
  const orders = trpc.commerce.orders.useQuery(undefined, {
    enabled: Boolean(me.data),
  });
  const transactions = trpc.commerce.transactions.useQuery(undefined, {
    enabled: Boolean(role && role !== "user"),
  });
  const login = trpc.auth.login.useMutation();
  const register = trpc.auth.register.useMutation();
  const logout = trpc.auth.logout.useMutation();
  const createConversation = trpc.support.create.useMutation();
  const reply = trpc.support.reply.useMutation();
  const setStatus = trpc.support.setStatus.useMutation();
  const createEmployee = trpc.auth.createEmployee.useMutation();
  const setOrderStatus = trpc.commerce.setOrderStatus.useMutation();
  useEffect(() => {
    if (openRequest > 0) setOpen(true);
  }, [openRequest]);
  const activeConversation = useMemo(
    () =>
      selectedConversation === null
        ? undefined
        : conversations.data?.find(item => item.id === selectedConversation),
    [conversations.data, selectedConversation]
  );
  const isPending = login.isPending || register.isPending;

  const refreshAccount = async () => {
    const { data: user } = await me.refetch();
    if (user) {
      await Promise.all([
        utils.support.list.invalidate(),
        utils.commerce.orders.invalidate(),
        utils.commerce.transactions.invalidate(),
      ]);
      return;
    }
    utils.support.list.setData(undefined, undefined);
    utils.commerce.orders.setData(undefined, undefined);
  };

  const submitAuth = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      if (registering) {
        await register.mutateAsync({
          name: String(form.get("name") ?? ""),
          email: String(form.get("email") ?? ""),
          password: String(form.get("password") ?? ""),
        });
      } else {
        const result = await login.mutateAsync({
          email: String(form.get("email") ?? ""),
          password: String(form.get("password") ?? ""),
        });
        window.location.assign(result.redirectTo);
        return;
      }
      await refreshAccount();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not sign in");
    }
  };

  const submitNewConversation = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const message = String(form.get("message") ?? "").trim();
    if (!message) return;
    try {
      const subject = String(form.get("subject") ?? "").trim();
      const channel = String(form.get("channel") ?? "books") as Channel;
      const conversation = await createConversation.mutateAsync({
        channel,
        subject,
        message,
      });
      setSelectedConversation(conversation.id);
      event.currentTarget.reset();
      await utils.support.list.invalidate();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not send message"
      );
    }
  };

  const submitReply = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeConversation) return;
    setError("");
    const form = new FormData(event.currentTarget);
    const message = String(form.get("message") ?? "").trim();
    if (!message) return;
    try {
      await reply.mutateAsync({
        conversationId: activeConversation.id,
        message,
      });
      event.currentTarget.reset();
      await utils.support.list.invalidate();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not send message"
      );
    }
  };

  const submitEmployee = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await createEmployee.mutateAsync({
        name: String(form.get("name") ?? ""),
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? ""),
      });
      event.currentTarget.reset();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not create employee account"
      );
    }
  };

  const signOut = async () => {
    await logout.mutateAsync();
    await refreshAccount();
    setSelectedConversation(null);
    setRegistering(false);
  };

  return (
    <>
      <button className="header-action" onClick={() => setOpen(true)}>
        <UserRound size={18} />
        <span>{me.data?.name ?? "Sign in"}</span>
      </button>
      {open &&
        createPortal(
          <div
            className="modal-backdrop account-backdrop"
            onClick={() => setOpen(false)}
          >
            <section
              className={`account-panel${me.data ? "" : " account-panel--auth"}`}
              role="dialog"
              aria-modal="true"
              aria-label="Account and support"
              onClick={event => event.stopPropagation()}
            >
              <header className="account-panel__header">
                <div>
                  <span className="eyebrow">
                    <span className="eyebrow__line" /> Account
                  </span>
                  <h2>
                    {me.data
                      ? `Hello, ${me.data.name}`
                      : registering
                        ? "Create your account"
                        : "Welcome back"}
                  </h2>
                  {me.data && (
                    <p>
                      {me.data.role === "user" ? "Customer" : me.data.role} ·{" "}
                      {me.data.email}
                    </p>
                  )}
                </div>
                <button
                  className="icon-button"
                  onClick={() => setOpen(false)}
                  aria-label="Close account panel"
                >
                  <X size={20} />
                </button>
              </header>

              {!me.data ? (
                <form className="account-auth-form" onSubmit={submitAuth}>
                  {registering && (
                    <label>
                      Full name
                      <input
                        name="name"
                        autoComplete="name"
                        minLength={2}
                        required
                      />
                    </label>
                  )}
                  <label>
                    Email
                    <input
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                    />
                  </label>
                  <label>
                    Password
                    <input
                      name="password"
                      type="password"
                      autoComplete={
                        registering ? "new-password" : "current-password"
                      }
                      minLength={registering ? 10 : 1}
                      required
                    />
                  </label>
                  <p className="account-help">
                    {registering
                      ? "Customer registration is open. Staff accounts are created privately by the store."
                      : "Sign in with your email and password."}
                  </p>
                  {error && <p className="checkout-error">{error}</p>}
                  <button
                    className="button button--primary button--full"
                    disabled={isPending}
                  >
                    {isPending
                      ? "Please wait…"
                      : registering
                        ? "Create customer account"
                        : "Sign in"}{" "}
                    <ArrowRight size={16} />
                  </button>
                  <button
                    type="button"
                    className="text-button account-switch"
                    onClick={() => {
                      setError("");
                      setRegistering(value => !value);
                    }}
                  >
                    {registering
                      ? "Already registered? Sign in"
                      : "New customer? Create an account"}
                  </button>
                </form>
              ) : (
                <>
                  <div className="account-toolbar">
                    <span>
                      <MessageCircle size={16} /> Support &amp; orders
                    </span>
                    <button
                      className="text-button"
                      onClick={() => void signOut()}
                    >
                      <LogOut size={15} /> Sign out
                    </button>
                  </div>
                  {me.data.role === "user" && (
                    <form
                      className="support-compose support-compose--new"
                      onSubmit={submitNewConversation}
                    >
                      <label>
                        Who should help?
                        <select name="channel" defaultValue="books">
                          <option value="books">
                            Book, order, or general inquiry — employee
                          </option>
                          <option value="system">
                            System problem or bug — admin
                          </option>
                        </select>
                      </label>
                      <label>
                        Subject
                        <input
                          name="subject"
                          placeholder="How can we help?"
                          minLength={3}
                          maxLength={160}
                          required
                        />
                      </label>
                      <label>
                        Message
                        <textarea
                          name="message"
                          rows={2}
                          maxLength={4000}
                          placeholder="Describe your question or concern…"
                          required
                        />
                      </label>
                      <button
                        className="button button--secondary"
                        disabled={createConversation.isPending}
                      >
                        Send and get an instant answer
                      </button>
                    </form>
                  )}
                  {error && <p className="checkout-error">{error}</p>}
                  <div className="account-content-grid">
                    <section>
                      <h3>
                        {role === "user"
                          ? "Your recent orders"
                          : "Transactions & orders"}
                      </h3>
                      {role !== "user" ? (
                        transactions.isLoading ? (
                          <p className="account-help">Loading transactions…</p>
                        ) : transactions.data?.length ? (
                          <div className="transaction-table-wrap">
                            <table className="transaction-table">
                              <thead>
                                <tr>
                                  <th>Order</th>
                                  <th>Customer</th>
                                  <th>Date</th>
                                  <th>Total</th>
                                  <th>Payment</th>
                                  <th>Payment status</th>
                                  <th>Order status</th>
                                  {role === "admin" && <th>Action</th>}
                                </tr>
                              </thead>
                              <tbody>
                                {transactions.data.map(transaction => (
                                  <tr key={transaction.id}>
                                    <td>#{transaction.orderId}</td>
                                    <td>
                                      {transaction.customerName}
                                      <small>{transaction.email}</small>
                                    </td>
                                    <td>
                                      {new Date(
                                        transaction.createdAt
                                      ).toLocaleDateString()}
                                    </td>
                                    <td>
                                      {formatPrice(
                                        transaction.amountCents / 100
                                      )}
                                    </td>
                                    <td>
                                      {PAYMENT_METHOD_LABELS[
                                        transaction.paymentMethod as CheckoutPaymentMethod
                                      ] ?? transaction.paymentMethod}
                                    </td>
                                    <td>{transaction.status}</td>
                                    <td>{transaction.orderStatus}</td>
                                    {role === "admin" && (
                                      <td>
                                        {transaction.orderStatus === "paid" && (
                                          <button
                                            className="text-button"
                                            onClick={() =>
                                              setOrderStatus.mutate(
                                                {
                                                  id: transaction.orderId,
                                                  status: "fulfilled",
                                                },
                                                {
                                                  onSuccess: () =>
                                                    Promise.all([
                                                      utils.commerce.orders.invalidate(),
                                                      utils.commerce.transactions.invalidate(),
                                                    ]),
                                                }
                                              )
                                            }
                                          >
                                            Mark fulfilled
                                          </button>
                                        )}
                                      </td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="account-help">
                            Transactions will appear here after checkout.
                          </p>
                        )
                      ) : orders.isLoading ? (
                        <p className="account-help">Loading orders…</p>
                      ) : orders.data?.length ? (
                        <div className="account-order-list">
                          {orders.data.map(order => (
                            <article className="account-order" key={order.id}>
                              <div>
                                <strong>Order #{order.id}</strong>
                                <span>
                                  {order.status} ·{" "}
                                  {new Date(
                                    order.createdAt
                                  ).toLocaleDateString()}
                                </span>
                              </div>
                              <span>{formatPrice(order.totalCents / 100)}</span>
                              <small>
                                {PAYMENT_METHOD_LABELS[
                                  order.paymentMethod as CheckoutPaymentMethod
                                ] ?? order.paymentMethod}{" "}
                                · Payment {order.paymentStatus}
                              </small>
                              <small>
                                Estimated delivery by {order.estimatedDelivery}{" "}
                                · Philippines
                              </small>
                              {order.items.map(item => (
                                <small key={item.bookId}>
                                  {item.quantity} × {item.title}
                                </small>
                              ))}
                            </article>
                          ))}
                        </div>
                      ) : (
                        <p className="account-help">
                          Your orders will appear here after checkout.
                        </p>
                      )}
                      {role === "admin" && (
                        <form
                          className="employee-form"
                          onSubmit={submitEmployee}
                        >
                          <h3>Create employee login</h3>
                          <label>
                            Name
                            <input name="name" minLength={2} required />
                          </label>
                          <label>
                            Email
                            <input name="email" type="email" required />
                          </label>
                          <label>
                            Temporary password
                            <input
                              name="password"
                              type="password"
                              minLength={12}
                              required
                            />
                          </label>
                          <button
                            className="button button--secondary"
                            disabled={createEmployee.isPending}
                          >
                            Create employee
                          </button>
                        </form>
                      )}
                    </section>
                    <section>
                      <h3>
                        {role === "user"
                          ? "Your conversations"
                          : role === "admin"
                            ? "System inbox"
                            : "Book support inbox"}
                      </h3>
                      {conversations.isLoading ? (
                        <p className="account-help">Loading conversations…</p>
                      ) : conversations.data?.length ? (
                        <>
                          <div className="conversation-list">
                            {conversations.data.map(item => (
                              <button
                                key={item.id}
                                className={
                                  item.id === activeConversation?.id
                                    ? "conversation-list__item is-active"
                                    : "conversation-list__item"
                                }
                                onClick={() => setSelectedConversation(item.id)}
                              >
                                <strong>{item.subject}</strong>
                                <small>
                                  {item.channel === "system"
                                    ? "Admin system chat"
                                    : "Employee book support"}{" "}
                                  · {item.status}
                                </small>
                              </button>
                            ))}
                          </div>
                          {activeConversation && (
                            <div className="conversation-detail">
                              <div className="conversation-messages">
                                {activeConversation.messages.map(
                                  (message, index) => (
                                    <article
                                      className={`conversation-message conversation-message--${message.senderRole}`}
                                      key={`${activeConversation.id}-${index}`}
                                    >
                                      <small>
                                        {message.senderName ??
                                          (message.senderRole === "bot"
                                            ? "Instant FAQ"
                                            : message.senderRole)}{" "}
                                        ·{" "}
                                        {new Date(
                                          String(message.createdAt)
                                        ).toLocaleString()}
                                      </small>
                                      <p>{message.body}</p>
                                    </article>
                                  )
                                )}
                              </div>
                              <form
                                className="support-compose"
                                onSubmit={submitReply}
                              >
                                <label>
                                  Reply
                                  <textarea
                                    name="message"
                                    rows={2}
                                    maxLength={4000}
                                    required
                                    placeholder="Write a reply…"
                                  />
                                </label>
                                <button
                                  className="button button--secondary"
                                  disabled={reply.isPending}
                                >
                                  Send reply
                                </button>
                              </form>
                              {role !== "user" &&
                                activeConversation.status === "open" && (
                                  <button
                                    className="text-button"
                                    onClick={() =>
                                      setStatus.mutate(
                                        {
                                          conversationId: activeConversation.id,
                                          status: "resolved",
                                        },
                                        {
                                          onSuccess: () =>
                                            utils.support.list.invalidate(),
                                        }
                                      )
                                    }
                                  >
                                    Mark resolved
                                  </button>
                                )}
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="account-help">
                          {me.data.role === "user"
                            ? "Start a conversation using the form above."
                            : "No conversations in this inbox yet."}
                        </p>
                      )}
                    </section>
                  </div>
                </>
              )}
            </section>
          </div>,
          document.body
        )}
    </>
  );
}
