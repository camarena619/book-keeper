"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Search } from "lucide-react";
import { ContactSchema, type ContactInput } from "@/lib/schemas/contact";
import {
  createContact,
  updateContact,
  deleteContact,
} from "@/app/dashboard/contacts/actions";

export interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
}

export function ContactsView({
  contacts,
  canEdit,
  canDelete,
}: {
  contacts: Contact[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Contact | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleting, setDeleting] = useState<Contact | null>(null);

  const filtered = contacts.filter((c) => {
    const q = query.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q)
    );
  });

  function openAdd() {
    setEditing(null);
    setShowForm(true);
  }
  function openEdit(c: Contact) {
    setEditing(c);
    setShowForm(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contacts</h1>
          <p className="text-sm text-slate-500">Customers &amp; vendors</p>
        </div>
        {canEdit && (
          <button className="btn-primary" onClick={openAdd}>
            + Add Contact
          </button>
        )}
      </header>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          className="input pl-9"
          placeholder="Search by name or email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="pb-2 font-medium">Name</th>
              <th className="pb-2 font-medium">Email</th>
              <th className="pb-2 font-medium">Phone</th>
              <th className="pb-2 font-medium">Address</th>
              {(canEdit || canDelete) && <th className="pb-2" />}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-b border-slate-100">
                <td className="py-2 font-medium">{c.name}</td>
                <td className="py-2 text-slate-600">{c.email}</td>
                <td className="py-2 text-slate-600">{c.phone}</td>
                <td className="py-2 text-slate-500">{c.address}</td>
                {(canEdit || canDelete) && (
                  <td className="py-2">
                    <div className="flex justify-end gap-1">
                      {canEdit && (
                        <button
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                          onClick={() => openEdit(c)}
                          aria-label="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          className="rounded p-1.5 text-red-500 hover:bg-red-50"
                          onClick={() => setDeleting(c)}
                          aria-label="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-400">
                  {contacts.length === 0
                    ? "No contacts yet."
                    : "No contacts match your search."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <ContactModal
          contact={editing}
          onClose={() => setShowForm(false)}
        />
      )}
      {deleting && (
        <DeleteConfirm
          contact={deleting}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

function ContactModal({
  contact,
  onClose,
}: {
  contact: Contact | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ContactInput>({
    resolver: zodResolver(ContactSchema),
    defaultValues: {
      name: contact?.name ?? "",
      email: contact?.email ?? "",
      phone: contact?.phone ?? "",
      address: contact?.address ?? "",
    },
  });

  async function onSubmit(values: ContactInput) {
    setServerError("");
    const result = contact
      ? await updateContact(contact.id, values)
      : await createContact(values);
    if (result.error) {
      setServerError(result.error);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold">
          {contact ? "Edit Contact" : "Add Contact"}
        </h3>
        {serverError && (
          <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {serverError}
          </div>
        )}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Field label="Name" error={errors.name?.message}>
            <input className="input" {...register("name")} />
          </Field>
          <Field label="Email" error={errors.email?.message}>
            <input className="input" type="email" {...register("email")} />
          </Field>
          <Field label="Phone" error={errors.phone?.message}>
            <input className="input" {...register("phone")} />
          </Field>
          <Field label="Address" error={errors.address?.message}>
            <textarea className="input" rows={2} {...register("address")} />
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : contact ? "Save" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

function DeleteConfirm({
  contact,
  onClose,
}: {
  contact: Contact;
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    setError("");
    const result = await deleteContact(contact.id);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold">Delete contact?</h3>
        <p className="mt-2 text-sm text-slate-500">
          This will permanently remove <strong>{contact.name}</strong>.
        </p>
        {error && (
          <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn inline-flex bg-danger text-white hover:bg-danger/90"
            onClick={confirm}
            disabled={pending}
          >
            {pending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
