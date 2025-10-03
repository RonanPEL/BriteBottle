import React from 'react'
import { fetchRoutes } from '../api'
import { Card, CardHeader, CardBody } from '../components/ui'
import { Route as RouteIcon } from 'lucide-react'

export default function RoutesPage(){
  const [routes, setRoutes] = React.useState([])
  const [error, setError] = React.useState(null)

  React.useEffect(()=>{ fetchRoutes().then(setRoutes).catch(e=>setError(e.message||'Failed to load')) }, [])

  const center = [53.3498, -6.2603]

  return (
    <div className='grid grid-cols-12 gap-6'>
  
    </div>
  )
}
