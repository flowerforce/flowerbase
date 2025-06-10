import { Navigate, Route, Routes } from 'react-router-dom'
import { APP_ROUTES } from './appRoutes'
import { Layout } from './components/Layout'
import { Registration } from './pages/Registration'
import { Login } from './pages/Login'
import { Welcome } from './pages/Welcome'
import { Home } from './pages/Home'
import { useAuthentication } from './hooks/useAuthentication'

function App() {

  const { isLoggedIn } = useAuthentication()

  return (
    <Routes>
      {isLoggedIn && <Route path={APP_ROUTES.INDEX} element={<Layout />}>
        <Route path={APP_ROUTES.HOME} element={<Home />} />
         <Route path="*" element={<Navigate to={APP_ROUTES.HOME} />} />
      </Route>
      }
      {!isLoggedIn && <Route path={APP_ROUTES.INDEX} element={<Layout />}>
        <Route path={APP_ROUTES.INDEX} element={<Welcome />} />
        <Route path={APP_ROUTES.REGISTRATION} element={<Registration />} />
        <Route path={APP_ROUTES.LOGIN} element={<Login />} />
        <Route path="*" element={<Navigate to={APP_ROUTES.INDEX} />} />
      </Route>
      }
    </Routes>

  )
}

export default App
