import React from 'react'
import { Card, CardHeader, CardBody } from '../components/ui'
import { Settings } from 'lucide-react'
export default function SettingsPage(){
  return (<Card><CardHeader title='Settings' icon={<Settings className='h-4 w-4 text-slate-600'/>}/><CardBody>App settings (API keys, polling intervals, map settings)</CardBody></Card>)
}
