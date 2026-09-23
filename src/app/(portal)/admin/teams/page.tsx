import { saveMember, saveTeam } from "@/app/actions/admin";
import { SubmitButton } from "@/components/client";
import { Field, inputCls } from "@/components/fields";
import { Flash } from "@/components/flash";
import { TEAM_ICONS, TeamIcon } from "@/components/team";
import { Card, Chip, SectionTitle } from "@/components/ui";
import { getSettings, listContacts, listTeams, listUsers, signInDomains } from "@/lib/server/data";
import { AddMemberForm, AdminAccessForm, ResetPasswordForm } from "./member-forms";

export default async function TeamsAdmin({ searchParams }: PageProps<"/admin/teams">) {
  const [teams, users, settings, contacts] = await Promise.all([listTeams(), listUsers(), getSettings(), listContacts()]);
  const domains = signInDomains();
  const unassigned = users.filter((u) => !u.teamId);

  return (
    <>
      <Flash searchParams={searchParams} />
      <section>
        <SectionTitle title="Teams" sub={`Target team size: ${settings.teamSize}. Team names always appear next to colours and icons.`} />
        <div className="grid gap-4 lg:grid-cols-2">
          {teams.map((t) => {
            const members = users.filter((u) => u.teamId === t.id);
            return (
              <Card key={t.id} className="p-5">
                <form action={saveTeam} className="grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="teamId" value={t.id} />
                  <div className="flex items-center gap-3 sm:col-span-2">
                    <TeamIcon team={t} size="lg" />
                    <div>
                      <p className="font-display text-2xl font-bold uppercase">{t.name}</p>
                      <p className="text-xs text-muted">
                        {members.length} member{members.length === 1 ? "" : "s"}
                        {members.length !== settings.teamSize && <span className="text-amber-700"> · target {settings.teamSize}</span>}
                      </p>
                    </div>
                  </div>
                  <Field label="Name" htmlFor={`name-${t.id}`}>
                    <input id={`name-${t.id}`} name="name" defaultValue={t.name} required className={inputCls} />
                  </Field>
                  <Field label="Captain" htmlFor={`lead-${t.id}`} hint="Shown on the team page. Captains can't change anything.">
                    <select id={`lead-${t.id}`} name="leadUserId" defaultValue={t.leadUserId ?? ""} className={inputCls}>
                      <option value="">No captain</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Colour" htmlFor={`color-${t.id}`}>
                    <input id={`color-${t.id}`} name="color" type="color" defaultValue={t.color} className="h-11 w-full rounded-xl border border-line bg-surface px-1" />
                  </Field>
                  <Field label="Icon" htmlFor={`icon-${t.id}`}>
                    <select id={`icon-${t.id}`} name="icon" defaultValue={t.icon} className={inputCls}>
                      {Object.keys(TEAM_ICONS).map((k) => (
                        <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)}</option>
                      ))}
                    </select>
                  </Field>
                  <div className="sm:col-span-2">
                    <SubmitButton variant="secondary">Save {t.name}</SubmitButton>
                  </div>
                </form>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="mt-10">
        <SectionTitle
          title="Add a member"
          sub={`People don't need an account to view the site. Only admins get a sign-in (and a temporary password to share)${
            domains.length ? `, and admins must use a ${domains.map((d) => `@${d}`).join(" or ")} email` : ""
          }.`}
        />
        <Card className="p-5">
          <AddMemberForm teams={teams.map((t) => ({ id: t.id, name: t.name }))} />
        </Card>
      </section>

      <section className="mt-10">
        <SectionTitle title="Members" sub="Moving someone takes effect from today. Their earlier steps stay with their previous team." />
        <ul className="space-y-2">
          {[...teams.flatMap((t) => users.filter((u) => u.teamId === t.id)), ...unassigned].map((u) => {
            const team = teams.find((t) => t.id === u.teamId);
            return (
              <li key={u.id}>
                <details className="group rounded-2xl border border-line bg-surface">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-2">
                    {team ? <TeamIcon team={team} size="sm" /> : <span className="size-6 rounded-md bg-line" aria-hidden="true" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{u.name}</span>
                      <span className="block truncate text-xs text-muted">{contacts.get(u.id)?.email ?? ""} · {team?.name ?? "No team"}</span>
                    </span>
                    {team?.leadUserId === u.id && <Chip>Captain</Chip>}
                    {u.isAdmin && (contacts.get(u.id)?.authUserId ? <Chip tone="info">Admin</Chip> : <Chip tone="warn">Admin · no sign-in yet</Chip>)}
                    {!u.active && <Chip tone="warn">Inactive</Chip>}
                    <span className="text-sm font-semibold text-night-3 group-open:hidden">Edit</span>
                  </summary>
                  <div className="border-t border-line-2 p-4">
                    <form action={saveMember} className="grid gap-3 sm:grid-cols-2">
                      <input type="hidden" name="userId" value={u.id} />
                      <Field label="Name" htmlFor={`n-${u.id}`}>
                        <input id={`n-${u.id}`} name="name" defaultValue={u.name} required className={inputCls} />
                      </Field>
                      <Field label="Email" htmlFor={`e-${u.id}`}>
                        <input id={`e-${u.id}`} name="email" type="email" defaultValue={contacts.get(u.id)?.email ?? ""} required className={inputCls} />
                      </Field>
                      <Field label="Team" htmlFor={`t-${u.id}`}>
                        <select id={`t-${u.id}`} name="teamId" defaultValue={u.teamId ?? ""} className={inputCls}>
                          <option value="">No team</option>
                          {teams.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                      </Field>
                      <div className="flex flex-wrap items-end gap-4 pb-3 text-sm">
                        <label className="flex items-center gap-2">
                          <input type="checkbox" name="active" defaultChecked={u.active} className="size-4.5 accent-night" /> Active
                        </label>
                      </div>
                      <div className="sm:col-span-2">
                        <SubmitButton variant="secondary">Save {u.name.split(" ")[0]}</SubmitButton>
                      </div>
                    </form>
                    <div className="mt-3 border-t border-line-2 pt-3">
                      <div className="flex flex-wrap items-start gap-2">
                        {u.isAdmin && !contacts.get(u.id)?.authUserId ? (
                          <>
                            <AdminAccessForm userId={u.id} grant label="Create their sign-in" />
                            <AdminAccessForm userId={u.id} grant={false} />
                          </>
                        ) : (
                          <AdminAccessForm userId={u.id} grant={!u.isAdmin} />
                        )}
                        {u.isAdmin && contacts.get(u.id)?.authUserId && <ResetPasswordForm userId={u.id} name={u.name} />}
                      </div>
                    </div>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
