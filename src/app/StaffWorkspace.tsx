import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { requestJson, ApiError } from '@/shared/api/client';
import type {
  StaffWorkspaceDto,
  StaffCommand,
  StaffCommandType,
} from '@/shared/api/access';
import { useAuthStore } from '@/shared/state/authStore';
import { todayLocalIso } from '@/shared/lib/dateUtils';
import {
  MANPOWER_POSITIONS,
  computeCivilWorksPayrollPreview,
  computeHaulerPayrollPreview,
} from '@/entities/project/manpowerPayroll';
import {
  PayrollPrintModal,
  type PayrollSheetData,
} from '@/widgets/manpower/PayrollPrintModal';
import {
  downloadCivilWorksPayrollCsv,
  downloadHaulerPayrollCsv,
} from '@/entities/project/payrollCsvExport';
import type {
  ManpowerMember,
  HaulingLogEntry,
  CentralMaterialItem,
  HaulerPayoutRecord,
  CivilWorksPayrollSnapshot,
  HaulerPayrollSnapshot,
  PayrollPeriodType,
} from '@/entities/project/types';
import './access.css';

type Submit = (
  type: StaffCommandType,
  payload: Record<string, unknown>
) => Promise<boolean>;
function Field({
  label,
  name,
  value,
  type = 'text',
  required = true,
}: {
  label: string;
  name: string;
  value?: string | number;
  type?: string;
  required?: boolean;
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        min={type === 'number' ? 0 : undefined}
        step={type === 'number' ? 'any' : undefined}
      />
    </label>
  );
}
function values(e: FormEvent<HTMLFormElement>) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.currentTarget));
  return data as Record<string, string>;
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="access-card">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
export function StaffWorkspace() {
  const user = useAuthStore((s) => s.user)!,
    logout = useAuthStore((s) => s.logout),
    check = useAuthStore((s) => s.checkSession);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]),
    [projectId, setProjectId] = useState(''),
    [workspace, setWorkspace] = useState<StaffWorkspaceDto | null>(null),
    [tab, setTab] = useState('manpower_payroll');
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [online, setOnline] = useState(navigator.onLine),
    [pending, setPending] = useState<StaffCommand | null>(null);
  useEffect(() => {
    let live = true;
    void requestJson<{ projects: { id: string; name: string }[] }>(
      '/api/admin/staff/projects'
    )
      .then((r) => {
        if (live) {
          setProjects(r.projects);
          setProjectId(r.projects[0]?.id ?? '');
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    const tick = window.setInterval(() => void check(), 30000);
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      live = false;
      clearInterval(tick);
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, [check]);
  useEffect(() => {
    let live = true;
    setWorkspace(null);
    setPending(null);
    if (projectId)
      void requestJson<{ workspace: StaffWorkspaceDto }>(
        `/api/admin/staff/projects/${encodeURIComponent(projectId)}/workspace`
      )
        .then((r) => {
          if (live) {
            setWorkspace(r.workspace);
            setTab(r.workspace.permissions[0] ?? '');
          }
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    return () => {
      live = false;
    };
  }, [projectId]);
  async function refresh() {
    setError('');
    try {
      const r = await requestJson<{ workspace: StaffWorkspaceDto }>(
        `/api/admin/staff/projects/${encodeURIComponent(projectId)}/workspace`
      );
      setWorkspace(r.workspace);
      setMessage('Latest data loaded. Review your form before resubmitting.');
    } catch (e) {
      handleError(e);
    }
  }
  function handleError(e: unknown) {
    setError(e instanceof Error ? e.message : 'Unable to save.');
    if (
      e instanceof ApiError &&
      (e.status === 401 || e.status === 403 || e.status === 404)
    ) {
      setWorkspace(null);
      void check();
    }
  }
  async function send(command: StaffCommand): Promise<boolean> {
    setBusy(true);
    setError('');
    setMessage('Saving…');
    try {
      const r = await requestJson<{ workspace: StaffWorkspaceDto }>(
        `/api/admin/staff/projects/${encodeURIComponent(projectId)}/commands`,
        { method: 'POST', body: JSON.stringify(command) }
      );
      setWorkspace(r.workspace);
      setPending(null);
      setMessage('Saved to the project.');
      return true;
    } catch (e) {
      handleError(e);
      setMessage('Changes have not been confirmed as saved.');
      if (e instanceof ApiError && e.status < 500) setPending(null);
      else setPending(command);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const submit: Submit = async (type, payload) => {
    if (!workspace || busy || !online || pending) return false;
    return send({
      operationId: crypto.randomUUID(),
      expectedVersion: workspace.version,
      type,
      payload,
    });
  };
  return (
    <div className="access-page">
      <header>
        <div>
          <p className="access-eyebrow">PROJECT ADMINISTRATION</p>
          <h1>Manpower & hauling</h1>
          <p>{user.displayName}</p>
        </div>
        <button onClick={() => void logout()}>Sign out</button>
      </header>
      <div className="access-toolbar">
        <label>
          Assigned project
          <select
            value={projectId}
            disabled={busy || Boolean(pending)}
            onChange={(e) => {
              setProjectId(e.target.value);
              setError('');
            }}
          >
            <option value="">Select project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => void refresh()}
          disabled={!projectId || busy || !online}
        >
          Refresh project
        </button>
      </div>
      {!online && (
        <p role="status" className="access-notice">
          You are offline. Connect to save changes or load project records.
        </p>
      )}
      {error && (
        <p role="alert" className="access-error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {pending && (
        <div className="access-notice">
          The connection was interrupted. Retry the same request to confirm
          whether it was saved.
          <button disabled={busy || !online} onClick={() => void send(pending)}>
            Retry save
          </button>
        </div>
      )}
      {!projects.length && (
        <p>
          No projects assigned. Ask the Site Engineer to assign this account.
        </p>
      )}
      {workspace && (
        <>
          <nav className="access-tabs">
            {workspace.permissions.map((p) => (
              <button
                key={p}
                aria-pressed={tab === p}
                onClick={() => setTab(p)}
              >
                {p === 'manpower_payroll'
                  ? 'Manpower & payroll'
                  : 'Hauling & inventory'}
              </button>
            ))}
          </nav>
          <fieldset
            disabled={busy || !online || Boolean(pending)}
            key={projectId}
          >
            {tab === 'manpower_payroll' &&
              workspace.permissions.includes('manpower_payroll') && (
                <Manpower workspace={workspace} submit={submit} />
              )}
            {tab === 'hauling_inventory' &&
              workspace.permissions.includes('hauling_inventory') && (
                <Hauling workspace={workspace} submit={submit} />
              )}
          </fieldset>
        </>
      )}
    </div>
  );
}
function Manpower({
  workspace: w,
  submit,
}: {
  workspace: StaffWorkspaceDto;
  submit: Submit;
}) {
  const [editing, setEditing] = useState<ManpowerMember | null>(null),
    [day, setDay] = useState(todayLocalIso()),
    [start, setStart] = useState(todayLocalIso()),
    [end, setEnd] = useState(todayLocalIso()),
    [kind, setKind] = useState<'civil' | 'hauler'>('civil'),
    [sheet, setSheet] = useState<PayrollSheetData | null>(null),
    [payout, setPayout] = useState<HaulerPayoutRecord | null>(null),
    [deductions, setDeductions] = useState<Record<string, number>>({}),
    [payouts, setPayouts] = useState<Record<string, number>>({});
  const [periodType, setPeriodType] = useState<PayrollPeriodType>('daily');
  const roster = w.manpowerRoster ?? [],
    attendance = w.civilAttendance ?? [],
    present = attendance.find((a) => a.date === day)?.presentMemberIds ?? [];
  const civil = computeCivilWorksPayrollPreview(
      roster,
      attendance,
      start,
      end,
      deductions
    ),
    hauler = computeHaulerPayrollPreview(
      w.haulingLogs,
      w.haulerPayouts,
      roster,
      start,
      end,
      periodType,
      w.haulingRateConfig,
      deductions
    );
  const reportProject = {
    ...w.context,
    haulingRateConfig: w.haulingRateConfig,
    civilAttendance: w.civilAttendance,
  };
  async function saveMember(e: FormEvent<HTMLFormElement>) {
    const form = e.currentTarget,
      v = values(e);
    if (
      await submit('member.save', {
        ...(editing ? { id: editing.id } : {}),
        name: v.name,
        category: v.category,
        position: v.position,
        dailyRatePhp: Number(v.dailyRatePhp),
        active: v.active === 'true',
        notes: v.notes,
      })
    ) {
      setEditing(null);
      form.reset();
    }
  }
  function preview() {
    const base = {
      id: 'preview',
      createdAt: new Date().toISOString(),
      periodType,
      startDate: start,
      endDate: end,
      title: `${kind === 'civil' ? 'Civil works' : 'Hauler'} payroll ${start} – ${end}`,
      status: 'generated' as const,
    };
    if (kind === 'civil')
      setSheet({
        kind: 'civil',
        snapshot: {
          ...base,
          items: civil.rows,
          totalDaysWorked: civil.totalDaysWorked,
          totalAmountPhp: civil.totalAmountPhp,
          totalGrossPayPhp: civil.totalGrossPayPhp,
          totalDeductionPhp: civil.totalDeductionPhp,
          totalNetPayPhp: civil.totalNetPayPhp,
        },
      });
    else {
      const items = hauler.rows.map((r) => ({
        ...r,
        payoutReleasedPhp: payouts[r.haulerName] ?? r.payoutReleasedPhp,
        netBalanceAfterPhp: Math.max(
          0,
          r.overallBalanceDuePhp -
            (payouts[r.haulerName] ?? r.payoutReleasedPhp) -
            (r.deductionPhp ?? 0)
        ),
      }));
      setSheet({
        kind: 'hauler',
        snapshot: {
          ...base,
          items,
          totalHauledKg: hauler.totalHauledKg,
          totalCredits: hauler.totalCredits,
          totalEarnedPhp: hauler.totalEarnedPhp,
          totalDeductionPhp: hauler.totalDeductionPhp,
          totalPayoutPhp: items.reduce((a, r) => a + r.payoutReleasedPhp, 0),
          ...hauler.rateConfig,
        },
      });
    }
  }
  function exportPayroll(data: PayrollSheetData) {
    if (data.kind === 'civil')
      downloadCivilWorksPayrollCsv(reportProject, data.snapshot);
    else downloadHaulerPayrollCsv(reportProject, data.snapshot);
  }
  return (
    <>
      <Section title="Worker & hauler roster">
        <div className="access-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Position</th>
                <th>Daily rate</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {roster.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td>{m.position}</td>
                  <td>₱{m.dailyRatePhp.toLocaleString()}</td>
                  <td>{m.active ? 'Active' : 'Inactive'}</td>
                  <td>
                    <button onClick={() => setEditing(m)}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3>{editing ? 'Edit worker' : 'Add worker'}</h3>
        <form key={editing?.id ?? 'new'} onSubmit={(e) => void saveMember(e)}>
          <Field label="Name" name="name" value={editing?.name} />
          <label>
            Category
            <select
              name="category"
              defaultValue={editing?.category ?? 'civil_works'}
            >
              <option value="civil_works">Civil works</option>
              <option value="hauler">Hauler</option>
            </select>
          </label>
          <label>
            Position
            <select
              name="position"
              defaultValue={editing?.position ?? 'Laborer'}
            >
              {MANPOWER_POSITIONS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <Field
            label="Daily rate (PHP)"
            name="dailyRatePhp"
            type="number"
            value={editing?.dailyRatePhp ?? 0}
          />
          <label>
            Status
            <select
              name="active"
              defaultValue={String(editing?.active ?? true)}
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </label>
          <Field
            label="Notes"
            name="notes"
            value={editing?.notes}
            required={false}
          />
          <button type="submit">Save worker</button>
          {editing && (
            <button type="button" onClick={() => setEditing(null)}>
              Cancel edit
            </button>
          )}
        </form>
      </Section>
      <Section title="Civil works attendance">
        <label>
          Date
          <input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </label>
        <div className="access-checks">
          {roster
            .filter(
              (m) =>
                m.category === 'civil_works' &&
                (m.active || present.includes(m.id))
            )
            .map((m) => (
              <label key={m.id}>
                <input
                  type="checkbox"
                  checked={present.includes(m.id)}
                  onChange={() =>
                    void submit('attendance.save', {
                      date: day,
                      presentMemberIds: present.includes(m.id)
                        ? present.filter((id) => id !== m.id)
                        : [...present, m.id],
                      notes:
                        attendance.find((a) => a.date === day)?.notes ?? '',
                    })
                  }
                />
                {m.name}
              </label>
            ))}
        </div>
      </Section>
      <Section title="Prepare payroll">
        <label>
          Period type
          <select
            value={periodType}
            onChange={(e) => setPeriodType(e.target.value as PayrollPeriodType)}
          >
            {['daily', 'weekly', 'monthly', 'overall'].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <div className="access-toolbar">
          <label>
            Payroll
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as 'civil' | 'hauler');
                setDeductions({});
                setPayouts({});
              }}
            >
              <option value="civil">Civil works</option>
              <option value="hauler">Haulers</option>
            </select>
          </label>
          <label>
            From
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>
        <div className="access-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Gross earned</th>
                <th>Deduction (PHP)</th>
                {kind === 'hauler' && <th>Payout (PHP)</th>}
              </tr>
            </thead>
            <tbody>
              {kind === 'civil'
                ? civil.rows.map((r) => (
                    <tr key={r.memberId}>
                      <td>
                        {r.name} · {r.daysPresent} days
                      </td>
                      <td>₱{r.grossPayPhp.toLocaleString()}</td>
                      <td>
                        <input
                          aria-label={`Deduction for ${r.name}`}
                          type="number"
                          min="0"
                          value={deductions[r.memberId] ?? 0}
                          onChange={(e) =>
                            setDeductions({
                              ...deductions,
                              [r.memberId]: Number(e.target.value),
                            })
                          }
                        />
                      </td>
                    </tr>
                  ))
                : hauler.rows.map((r) => (
                    <tr key={r.haulerName}>
                      <td>{r.haulerName}</td>
                      <td>₱{r.grossEarnedPhp.toLocaleString()}</td>
                      <td>
                        <input
                          aria-label={`Deduction for ${r.haulerName}`}
                          type="number"
                          min="0"
                          value={deductions[r.haulerName] ?? 0}
                          onChange={(e) =>
                            setDeductions({
                              ...deductions,
                              [r.haulerName]: Number(e.target.value),
                            })
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Payout for ${r.haulerName}`}
                          type="number"
                          min="0"
                          value={payouts[r.haulerName] ?? r.payoutReleasedPhp}
                          onChange={(e) =>
                            setPayouts({
                              ...payouts,
                              [r.haulerName]: Number(e.target.value),
                            })
                          }
                        />
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        <form
          onSubmit={(e) => {
            const v = values(e);
            void submit('payroll.create', {
              kind,
              startDate: start,
              endDate: end,
              periodType,
              title: v.title,
              notes: v.notes,
              deductions,
              payouts,
            });
          }}
        >
          <Field label="Payroll title" name="title" value="Payroll" />
          <Field label="Notes" name="notes" required={false} />
          <button type="submit">Save payroll</button>
          <button type="button" onClick={preview}>
            Preview / print payroll
          </button>
        </form>
      </Section>
      <Section title="Payroll history">
        <p>
          Marking a hauler payroll paid creates its linked payout and deduction
          records.
        </p>
        <div className="access-scroll">
          <table>
            <thead>
              <tr>
                <th>Payroll</th>
                <th>Period</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {[
                ...(w.civilPayrollHistory ?? []).map((snapshot) => ({
                  kind: 'civil' as const,
                  snapshot,
                })),
                ...(w.haulerPayrollHistory ?? []).map((snapshot) => ({
                  kind: 'hauler' as const,
                  snapshot,
                })),
              ].map((data) => (
                <tr key={data.snapshot.id}>
                  <td>
                    {data.snapshot.title}
                    <br />
                    {data.kind}
                  </td>
                  <td>
                    {data.snapshot.startDate} – {data.snapshot.endDate}
                  </td>
                  <td>
                    ₱
                    {(data.kind === 'civil'
                      ? (data.snapshot as CivilWorksPayrollSnapshot)
                          .totalAmountPhp
                      : (data.snapshot as HaulerPayrollSnapshot).totalPayoutPhp
                    ).toLocaleString()}
                  </td>
                  <td>{data.snapshot.status}</td>
                  <td>
                    <button onClick={() => setSheet(data)}>Print</button>
                    <button onClick={() => exportPayroll(data)}>CSV</button>
                    <button
                      onClick={() => {
                        if (
                          window.confirm(
                            `Mark this payroll ${data.snapshot.status === 'paid' ? 'generated' : 'paid'}?`
                          )
                        )
                          void submit('payroll.status', {
                            kind: data.kind,
                            id: data.snapshot.id,
                            status:
                              data.snapshot.status === 'paid'
                                ? 'generated'
                                : 'paid',
                            paidDate: todayLocalIso(),
                          });
                      }}
                    >
                      {data.snapshot.status === 'paid'
                        ? 'Mark generated'
                        : 'Mark paid'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title="Hauler payouts & deductions">
        <form
          key={payout?.id ?? 'new'}
          onSubmit={(e) => {
            const v = values(e);
            void submit('payout.save', {
              ...(payout ? { id: payout.id } : {}),
              date: v.date,
              haulerName: v.haulerName,
              amountPhp: Number(v.amountPhp),
              kind: v.kind,
              notes: v.notes,
            }).then((ok) => {
              if (ok) setPayout(null);
            });
          }}
        >
          <Field
            label="Date"
            name="date"
            type="date"
            value={payout?.date ?? todayLocalIso()}
          />
          <label>
            Hauler
            <select name="haulerName" defaultValue={payout?.haulerName}>
              {w.haulerNames.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <label>
            Type
            <select name="kind" defaultValue={payout?.kind ?? 'payout'}>
              <option value="payout">Payout</option>
              <option value="deduction">Deduction</option>
            </select>
          </label>
          <Field
            label="Amount (PHP)"
            name="amountPhp"
            type="number"
            value={payout?.amountPhp}
          />
          <Field
            label="Notes"
            name="notes"
            value={payout?.notes}
            required={false}
          />
          <button type="submit">Save entry</button>
          {payout && (
            <button type="button" onClick={() => setPayout(null)}>
              Cancel
            </button>
          )}
        </form>
        <ul>
          {(w.haulerPayouts ?? []).map((p) => (
            <li key={p.id}>
              {p.date} · {p.haulerName} · {p.kind ?? 'payout'} · ₱
              {p.amountPhp.toLocaleString()}{' '}
              {p.payrollSnapshotId ? (
                <span>Linked payroll</span>
              ) : (
                <button onClick={() => setPayout(p)}>Edit</button>
              )}
            </li>
          ))}
        </ul>
      </Section>
      {sheet && (
        <PayrollPrintModal
          project={reportProject}
          data={sheet}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  );
}
function csv(name: string, rows: unknown[][]) {
  const content = rows
    .map((row) =>
      row
        .map(
          (v) =>
            '"' +
            String(v ?? '')
              .replace(/"/g, '""')
              .replace(/^([=+@-])/, '\t$1') +
            '"'
        )
        .join(',')
    )
    .join('\r\n');
  const url = URL.createObjectURL(
    new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' })
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
function Hauling({
  workspace: w,
  submit,
}: {
  workspace: StaffWorkspaceDto;
  submit: Submit;
}) {
  const [trip, setTrip] = useState<HaulingLogEntry | null>(null),
    [material, setMaterial] = useState<CentralMaterialItem | null>(null);
  const materials = w.centralMaterials ?? [];
  return (
    <>
      <Section title="Hauling log">
        <div className="access-toolbar">
          <button
            onClick={() =>
              csv('hauling-report.csv', [
                ['Project', w.context.projectName],
                [
                  'Date',
                  'Hauler',
                  'Material',
                  'Quantity',
                  'Unit',
                  'Weight (kg)',
                  'Destination',
                  'Remarks',
                ],
                ...w.haulingLogs.map((l) => [
                  l.date,
                  l.haulerName,
                  l.itemLabel,
                  l.quantity,
                  l.unitLabel,
                  l.totalKg,
                  l.destinationFoundationId,
                  l.remarks,
                ]),
              ])
            }
          >
            Export hauling CSV
          </button>
          <button onClick={() => window.print()}>
            Print hauling & inventory
          </button>
        </div>
        <div className="access-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Hauler</th>
                <th>Material</th>
                <th>Quantity</th>
                <th>Weight</th>
                <th>Destination</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {w.haulingLogs.map((l) => (
                <tr key={l.id}>
                  <td>{l.date}</td>
                  <td>{l.haulerName}</td>
                  <td>{l.itemLabel ?? l.material}</td>
                  <td>
                    {l.quantity} {l.unitLabel}
                  </td>
                  <td>{l.totalKg} kg</td>
                  <td>{l.destinationFoundationId}</td>
                  <td>
                    <button onClick={() => setTrip(l)}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3>{trip ? 'Edit hauling entry' : 'Add hauling entry'}</h3>
        <p>
          Each entry records one material in a trip. Use the same trip number
          for materials delivered together.
        </p>
        <form
          key={trip?.id ?? 'new'}
          onSubmit={(e) => {
            const form = e.currentTarget,
              v = values(e);
            void submit('hauling.save', {
              ...(trip
                ? {
                    id: trip.id,
                    ...(trip.tripGroupId
                      ? { tripGroupId: trip.tripGroupId }
                      : {}),
                  }
                : {}),
              date: v.date,
              haulerName: v.haulerName,
              materialId: v.materialId,
              tripNumber: Number(v.tripNumber),
              horsesUsed: Number(v.horsesUsed),
              tripsCount: Number(v.tripsCount),
              quantity: Number(v.quantity),
              kgPerUnit: Number(v.kgPerUnit),
              destinationFoundationId: v.destinationFoundationId,
              weather: v.weather,
              remarks: v.remarks,
            }).then((ok) => {
              if (ok) {
                setTrip(null);
                form.reset();
              }
            });
          }}
        >
          <Field
            label="Date"
            name="date"
            type="date"
            value={trip?.date ?? todayLocalIso()}
          />
          <label>
            Hauler
            <select name="haulerName" defaultValue={trip?.haulerName}>
              {w.haulerNames.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <label>
            Material
            <select name="materialId" defaultValue={trip?.materialId}>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.unit})
                </option>
              ))}
            </select>
          </label>
          <Field
            label="Trip number"
            name="tripNumber"
            type="number"
            value={trip?.tripNumber ?? 1}
          />
          <Field
            label="Horses"
            name="horsesUsed"
            type="number"
            value={trip?.horsesUsed ?? 1}
          />
          <Field
            label="Trips"
            name="tripsCount"
            type="number"
            value={trip?.tripsCount ?? 1}
          />
          <Field
            label="Quantity"
            name="quantity"
            type="number"
            value={trip?.quantity}
          />
          <Field
            label="Weight per unit (kg)"
            name="kgPerUnit"
            type="number"
            value={trip?.kgPerUnit ?? 40}
          />
          <label>
            Destination
            <select
              name="destinationFoundationId"
              defaultValue={trip?.destinationFoundationId ?? 'STOCKPILE'}
            >
              <option value="STOCKPILE">Stockpile</option>
              {w.destinations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="Weather"
            name="weather"
            value={trip?.weather}
            required={false}
          />
          <Field
            label="Remarks"
            name="remarks"
            value={trip?.remarks}
            required={false}
          />
          <button type="submit">Save hauling entry</button>
          {trip && (
            <button type="button" onClick={() => setTrip(null)}>
              Cancel edit
            </button>
          )}
        </form>
      </Section>
      <Section title="Material inventory">
        <button
          onClick={() =>
            csv('inventory-report.csv', [
              ['Project', w.context.projectName],
              [
                'Material',
                'Unit',
                'Yard stock',
                'Hauled',
                'Yard remaining',
                'Used onsite',
                'Onsite remaining',
              ],
              ...(w.inventorySummary ?? []).map((r) => [
                r.item.name,
                r.item.unit,
                r.stockYardTotalQty,
                r.hauledQty,
                r.stockYardRemainingQty,
                r.usedOnSiteQty,
                r.onSiteRemainingQty,
              ]),
            ])
          }
        >
          Export inventory CSV
        </button>
        <div className="access-scroll">
          <table>
            <thead>
              <tr>
                <th>Material</th>
                <th>Yard stock</th>
                <th>Hauled</th>
                <th>Yard remaining</th>
                <th>Used onsite</th>
                <th>Onsite remaining</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(w.inventorySummary ?? []).map((r) => (
                <tr key={r.item.id}>
                  <td>
                    {r.item.name} ({r.item.unit})
                  </td>
                  <td>{r.stockYardTotalQty}</td>
                  <td>{r.hauledQty}</td>
                  <td>{r.stockYardRemainingQty}</td>
                  <td>{r.usedOnSiteQty}</td>
                  <td>{r.onSiteRemainingQty}</td>
                  <td>
                    <button onClick={() => setMaterial(r.item)}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3>{material ? 'Edit material' : 'Add material'}</h3>
        <form
          key={material?.id ?? 'new'}
          onSubmit={(e) => {
            const v = values(e);
            void submit('material.save', {
              ...(material ?? {}),
              name: v.name,
              category: v.category,
              unit: v.unit,
              haulingMaterialKey: v.haulingMaterialKey,
              targetQty: Number(v.targetQty),
              stockYardTotalQty: Number(v.stockYardTotalQty),
              onSiteOpeningQty: Number(v.onSiteOpeningQty),
              defaultKgPerUnit: Number(v.defaultKgPerUnit),
              remarks: v.remarks,
            }).then((ok) => {
              if (ok) setMaterial(null);
            });
          }}
        >
          <Field label="Name" name="name" value={material?.name} />
          <label>
            Category
            <select
              name="category"
              defaultValue={material?.category ?? 'shared'}
            >
              <option value="foundation">Foundation</option>
              <option value="vertical_mast">Vertical mast</option>
              <option value="shared">Shared</option>
            </select>
          </label>
          <Field label="Unit" name="unit" value={material?.unit ?? 'pcs'} />
          <label>
            Material type
            <select
              name="haulingMaterialKey"
              defaultValue={material?.haulingMaterialKey ?? 'other'}
            >
              {[
                'cement',
                'sand',
                'gravel',
                'main_bar_a',
                'chair_bar_a',
                'main_bar_b',
                'chair_bar_b',
                'main_bar_c',
                'chair_bar_c',
                'rebar_20mm',
                'anchor_rod',
                'phenolic_board',
                'tower_section',
                'tower_accessory',
                'other',
              ].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <Field
            label="Target quantity"
            name="targetQty"
            type="number"
            value={material?.targetQty ?? 0}
          />
          <Field
            label="Yard stock received"
            name="stockYardTotalQty"
            type="number"
            value={material?.stockYardTotalQty ?? 0}
          />
          <Field
            label="Onsite opening quantity"
            name="onSiteOpeningQty"
            type="number"
            value={material?.onSiteOpeningQty ?? 0}
          />
          <Field
            label="Default kg per unit"
            name="defaultKgPerUnit"
            type="number"
            value={material?.defaultKgPerUnit ?? 40}
          />
          <Field
            label="Remarks"
            name="remarks"
            value={material?.remarks}
            required={false}
          />
          <button type="submit">Save material</button>
          {material && (
            <button type="button" onClick={() => setMaterial(null)}>
              Cancel edit
            </button>
          )}
        </form>
      </Section>
      <Section title="Hauling rates">
        <form
          key={JSON.stringify(w.haulingRateConfig)}
          onSubmit={(e) => {
            const v = values(e);
            void submit('rates.save', {
              creditBlockKg: Number(v.creditBlockKg),
              ratePerBlockPhp: Number(v.ratePerBlockPhp),
            });
          }}
        >
          <Field
            label="Credit block (kg)"
            name="creditBlockKg"
            type="number"
            value={w.haulingRateConfig.creditBlockKg}
          />
          <Field
            label="Rate per block (PHP)"
            name="ratePerBlockPhp"
            type="number"
            value={w.haulingRateConfig.ratePerBlockPhp}
          />
          <button type="submit">Save rates</button>
        </form>
      </Section>
    </>
  );
}
