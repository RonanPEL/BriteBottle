import React from 'react'
import { fetchAlerts } from '../api'
import { Card, CardHeader, CardBody } from '../components/ui'
import { Bell } from 'lucide-react'
import { useAuth } from "../auth/AuthContext"
import { can } from "../auth/ability"

export default function AlertsPage(){
  const [alerts, setAlerts] = React.useState([])
  const [error, setError] = React.useState(null)
  React.useEffect(()=>{ fetchAlerts(100).then(setAlerts).catch(e=>setError(e.message||'Failed to load')) }, [])

  const auth = useAuth();
if (!can(auth, "view.alerts")) {
  return (
    <div className="p-6">
      <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-800 p-3 text-sm">
        You don’t have permission to view Alerts.
      </div>
    </div>
  );
}

  return (
    <Card>
      <CardHeader title='Alerts' icon={<Bell className='h-4 w-4 text-slate-600'/>} />
      <CardBody className='p-0'>
        {error && <div className='m-4 rounded-md bg-rose-50 border border-rose-200 text-rose-800 px-3 py-2'>{error}</div>}
        <div className='overflow-x-auto'>
          <table className='min-w-full text-sm'>
            <thead className='text-left text-slate-500 bg-slate-50/60'><tr><th className='px-4 py-3'>Time</th><th className='px-4 py-3'>Level</th><th className='px-4 py-3'>Crusher</th><th className='px-4 py-3'>Message</th></tr></thead>
            <tbody>
              {alerts.map(a => (
                <tr key={a.id} className='border-t border-slate-100'>
                  <td className='px-4 py-3 text-slate-500'>{new Date(a.time).toLocaleString()}</td>
                  <td className='px-4 py-3'><span className={`px-2 py-1 rounded-full text-xs ${a.level==='critical'?'bg-rose-100 text-rose-700':a.level==='warning'?'bg-amber-100 text-amber-700':'bg-slate-100 text-slate-600'}`}>{a.level}</span></td>
                  <td className='px-4 py-3'>{a.crusherId || '—'}</td>
                  <td className='px-4 py-3'>{a.message}</td>
                </tr>
              ))}
              {!alerts.length && <tr><td colSpan='4' className='px-4 py-8 text-center text-slate-500'>No alerts</td></tr>}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  )
}
