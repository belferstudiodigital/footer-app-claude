import { Suspense, lazy } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Spinner } from './components/ui/Feedback'
import { RequireAdminClube, RequireSuperadmin } from './components/RouteGuards'

const Home = lazy(() => import('./pages/public/Home'))
const Cadastro = lazy(() => import('./pages/public/Cadastro'))
const Login = lazy(() => import('./pages/public/Login'))
const Assinatura = lazy(() => import('./pages/public/Assinatura'))
const AguardandoAtivacao = lazy(() => import('./pages/public/AguardandoAtivacao'))
const Regularizar = lazy(() => import('./pages/public/Regularizar'))
const JogoPublico = lazy(() => import('./pages/public/JogoPublico'))
const RankingPublico = lazy(() => import('./pages/public/RankingPublico'))

const Dashboard = lazy(() => import('./pages/admin/Dashboard'))
const Times = lazy(() => import('./pages/admin/Times'))
const TimeForm = lazy(() => import('./pages/admin/TimeForm'))
const Presenca = lazy(() => import('./pages/admin/Presenca'))
const Sorteio = lazy(() => import('./pages/admin/Sorteio'))
const Pagamentos = lazy(() => import('./pages/admin/Pagamentos'))
const Notificacoes = lazy(() => import('./pages/admin/Notificacoes'))
const Ranking = lazy(() => import('./pages/admin/Ranking'))
const Plano = lazy(() => import('./pages/admin/Plano'))

const SuperOverview = lazy(() => import('./pages/superadmin/Overview'))
const SuperUsuarios = lazy(() => import('./pages/superadmin/Usuarios'))
const SuperFaturamento = lazy(() => import('./pages/superadmin/Faturamento'))
const SuperNotificacoes = lazy(() => import('./pages/superadmin/Notificacoes'))
const SuperConfiguracoes = lazy(() => import('./pages/superadmin/Configuracoes'))

function PageFallback() {
  return <Spinner className="min-h-dvh" />
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        {/* Públicas */}
        <Route path="/" element={<Home />} />
        <Route path="/cadastro" element={<Cadastro />} />
        <Route path="/login" element={<Login />} />
        <Route path="/assinatura" element={<Assinatura />} />
        <Route path="/aguardando-ativacao" element={<AguardandoAtivacao />} />
        <Route path="/regularizar" element={<Regularizar />} />
        <Route path="/jogo/:jogoId" element={<JogoPublico />} />
        <Route path="/ranking/:timeId" element={<RankingPublico />} />

        {/* Admin de clube */}
        <Route path="/admin" element={<RequireAdminClube><Dashboard /></RequireAdminClube>} />
        <Route path="/admin/times" element={<RequireAdminClube><Times /></RequireAdminClube>} />
        <Route path="/admin/times/novo" element={<RequireAdminClube><TimeForm /></RequireAdminClube>} />
        <Route path="/admin/times/:timeId" element={<RequireAdminClube><TimeForm /></RequireAdminClube>} />
        <Route path="/admin/presenca" element={<RequireAdminClube><Presenca /></RequireAdminClube>} />
        <Route path="/admin/sorteio" element={<RequireAdminClube><Sorteio /></RequireAdminClube>} />
        <Route path="/admin/pagamentos" element={<RequireAdminClube><Pagamentos /></RequireAdminClube>} />
        <Route path="/admin/notificacoes" element={<RequireAdminClube><Notificacoes /></RequireAdminClube>} />
        <Route path="/admin/ranking" element={<RequireAdminClube><Ranking /></RequireAdminClube>} />
        <Route path="/admin/plano" element={<RequireAdminClube><Plano /></RequireAdminClube>} />

        {/* Superadmin */}
        <Route path="/superadmin" element={<RequireSuperadmin><SuperOverview /></RequireSuperadmin>} />
        <Route path="/superadmin/usuarios" element={<RequireSuperadmin><SuperUsuarios /></RequireSuperadmin>} />
        <Route path="/superadmin/faturamento" element={<RequireSuperadmin><SuperFaturamento /></RequireSuperadmin>} />
        <Route path="/superadmin/notificacoes" element={<RequireSuperadmin><SuperNotificacoes /></RequireSuperadmin>} />
        <Route path="/superadmin/configuracoes" element={<RequireSuperadmin><SuperConfiguracoes /></RequireSuperadmin>} />

        <Route path="*" element={<Home />} />
      </Routes>
    </Suspense>
  )
}
