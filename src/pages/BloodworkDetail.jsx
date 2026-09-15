import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';

function FlagChip({ flag }) {
    const cls = flag === 'high' ? 'red' : flag === 'low' ? 'amber' : 'gray';
    return <span className={`chip ${cls}`}>{flag || 'normal'}</span>;
}

export default function BloodworkDetail() {
    const { id } = useParams();
    const [report, setReport] = useState(null);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        try {
            const res = await api.get(`/api/bloodwork/${id}`);
            setReport(res);
        } catch (err) {
            setError(err.message);
        }
    }, [id]);

    useEffect(() => {
        load();
    }, [load]);

    if (error) {
        return (
            <main className="container stack">
                <div className="banner red">{error}</div>
                <Link className="btn subtle" to="/profile">Back to profile</Link>
            </main>
        );
    }

    if (!report) {
        return (
            <main className="container">
                <div className="center" style={{ padding: 40 }}><div className="spin" /></div>
            </main>
        );
    }

    return (
        <main className="container stack">
            <div>
                <div className="page-title">{report.report_type === 'urine' ? 'Urinalysis' : 'Blood work'} analysis</div>
                <div className="page-sub">{report.original_name}</div>
            </div>

            <div className="banner amber">Informational only — not medical advice. Talk to a professional about any flagged values.</div>

            {!report.parsed ? (
                <section className="card">
                    <p className="card-hint">Still analyzing this report — check back in a moment.</p>
                </section>
            ) : (
                <>
                    {report.summary && (
                        <section className="card">
                            <div className="card-head"><h3>Summary</h3></div>
                            <p className="card-hint">{report.summary}</p>
                        </section>
                    )}

                    {report.markers?.length > 0 && (
                        <section className="card">
                            <div className="card-head"><h3>Markers</h3></div>
                            <div style={{ overflowX: 'auto' }}>
                                <table className="marker-table">
                                    <thead>
                                        <tr>
                                            <th>Marker</th>
                                            <th>Value</th>
                                            <th>Reference range</th>
                                            <th>Flag</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {report.markers.map((m, i) => (
                                            <tr key={i}>
                                                <td>{m.name}</td>
                                                <td>{m.value}{m.unit ? ` ${m.unit}` : ''}</td>
                                                <td className="muted">{m.refRange || '—'}</td>
                                                <td><FlagChip flag={m.flag} /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )}

                    {report.nutrition_notes && (
                        <section className="card">
                            <div className="card-head"><h3>Nutrition notes</h3></div>
                            <p className="card-hint">{report.nutrition_notes}</p>
                        </section>
                    )}
                </>
            )}

            <Link className="btn subtle" to="/profile">Back to profile</Link>
        </main>
    );
}
